import { getClickInterceptorScript } from '../ipc/IpcBridge';
import { resolveCss, rewriteCssValue, CssContext } from './css';
import { isSpecialUrl, parseSrcset, resolveVaultPath, splitUrl } from './paths';

export interface AssetDiagnostic {
  kind: 'missing' | 'blocked' | 'error';
  path: string;
  message: string;
}

export interface ResolveHtmlAssetsOptions {
  /** Raw HTML document string */
  rawHtml: string;
  /** Relative directory path of the active HTML file within the vault (e.g., "lessons" or "") */
  currentFileFolderPath: string;
  /** Injected function resolving normalized vault path to a resource URI (data URLs in the plugin). */
  getResourcePathFn: (vaultPath: string) => string | Promise<string>;
  /** Injected function reading a file from the vault asynchronously */
  readVaultFileFn?: (vaultPath: string) => Promise<string>;
  /** Document scripts are opt-in. The isolated plugin bridge always remains available. */
  allowScripts?: boolean;
  bridgeToken?: string;
}

export interface ResolveHtmlAssetsResult {
  /** The transformed HTML document string with updated URLs, CSP, and IPC script */
  transformedHtml: string;
  /** List of relative vault file paths discovered and transformed (used for live reload dependency tracking) */
  assetPaths: string[];
  diagnostics: AssetDiagnostic[];
  headings: Array<{ id: string; text: string; level: number }>;
}

export function createBridgeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Pure function that parses HTML, transforms relative asset paths to vault resource URIs,
 * injects a Content Security Policy meta tag, and embeds the IPC click interception script.
 * All I/O is injected; document content cannot broaden the plugin's security policy.
 */
export async function resolveHtmlAssets(options: ResolveHtmlAssetsOptions): Promise<ResolveHtmlAssetsResult> {
  const { rawHtml, currentFileFolderPath, getResourcePathFn, readVaultFileFn, allowScripts = false } = options;
  const token = options.bridgeToken || createBridgeToken();
  const assetPaths = new Set<string>();
  const diagnostics: AssetDiagnostic[] = [];
  const report = (kind: AssetDiagnostic['kind'], path: string, message: string) => {
    if (!diagnostics.some(d => d.kind === kind && d.path === path && d.message === message)) diagnostics.push({ kind, path, message });
  };
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');
  const resourceCache = new Map<string, Promise<string>>();
  const stylesheetCache = new Map<string, Promise<string>>();
  let stylesheetReads = 0;
  const resolveAsset = async (url: string, folder: string): Promise<string> => {
    const value = url.trim();
    if (!value || value.startsWith('#')) return value;
    if (/^(data:|blob:)/i.test(value)) return value;
    if (isSpecialUrl(value)) {
      report('blocked', value, 'External or unsupported resource blocked');
      return '';
    }
    try {
      const { path, suffix } = splitUrl(value);
      const vaultPath = resolveVaultPath(folder, path);
      assetPaths.add(vaultPath);
      if (!resourceCache.has(vaultPath)) resourceCache.set(vaultPath, Promise.resolve().then(() => getResourcePathFn(vaultPath)));
      const uri = await resourceCache.get(vaultPath)!;
      if (!uri) throw new Error('Resource unavailable');
      // Query strings cache-bust files, not embedded data. SVG fragments still select symbols.
      return uri + (/^data:/i.test(uri) ? (suffix.includes('#') ? suffix.slice(suffix.indexOf('#')) : '') : suffix);
    } catch (error) {
      report('missing', value, error instanceof Error ? error.message : String(error));
      return '';
    }
  };
  const cssContext: CssContext = {
    resolveAsset,
    readStylesheet: async path => {
      assetPaths.add(path);
      if (++stylesheetReads > 256) throw new Error('Stylesheet import limit exceeded');
      if (!readVaultFileFn) throw new Error('Stylesheet reader unavailable');
      if (!stylesheetCache.has(path)) stylesheetCache.set(path, readVaultFileFn(path));
      return stylesheetCache.get(path)!;
    },
    report: (path, message) => report('error', path, message)
  };
  const processAttribute = async (node: Element, attribute: string) => {
    const raw = node.getAttribute(attribute);
    if (raw) {
      const uri = await resolveAsset(raw, currentFileFolderPath);
      if (uri) node.setAttribute(attribute, uri);
      else node.removeAttribute(attribute);
    }
  };

  // Find all CSP meta tags (case-insensitive value match, trimmed).
  // Refresh/base elements cannot redirect a preview or change its security origin.
  doc.querySelectorAll('meta[http-equiv], base').forEach(node => {
    const directive = node.getAttribute('http-equiv')?.trim().toLowerCase();
    if (node.tagName.toLowerCase() === 'base' || directive === 'content-security-policy' || directive === 'refresh') node.remove();
  });
  doc.querySelectorAll('iframe, frame, frameset, object, embed').forEach(node => {
    report('blocked', node.getAttribute('src') || node.getAttribute('data') || node.tagName.toLowerCase(), 'Nested active content is blocked');
    node.remove();
  });
  doc.querySelectorAll('*').forEach(node => {
    for (const attribute of Array.from(node.attributes)) {
      if ((!allowScripts && /^on/i.test(attribute.name)) || attribute.name === 'nonce' || attribute.name === 'ping') node.removeAttribute(attribute.name);
      if (/^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
    }
  });

  // Process asset elements. Inline styles are processed before linked styles so resolved CSS
  // is never processed twice in the wrong directory.
  for (const node of Array.from(doc.querySelectorAll('style'))) {
    try {
      const css = await resolveCss(node.textContent || '', `${currentFileFolderPath ? currentFileFolderPath + '/' : ''}__inline__.css`, cssContext);
      node.textContent = css.toString().replace(/<\/style/gi, '<\\/style');
    } catch (error) {
      report('error', 'Inline stylesheet', String(error));
      node.remove();
    }
  }
  for (const node of Array.from(doc.querySelectorAll('link[href]'))) {
    const rel = (node.getAttribute('rel') || '').toLowerCase().split(/\s+/);
    const href = node.getAttribute('href') || '';
    if (!rel.includes('stylesheet')) {
      // Preloads, preconnect and alternate navigation are unnecessary for an embedded document.
      node.remove();
      continue;
    }
    try {
      if (isSpecialUrl(href)) throw new Error('Only local stylesheets are supported');
      const path = resolveVaultPath(currentFileFolderPath, splitUrl(href).path);
      const text = await cssContext.readStylesheet(path);
      const css = await resolveCss(text, path, cssContext);
      const style = doc.createElement('style');
      style.textContent = css.toString().replace(/<\/style/gi, '<\\/style');
      for (const attribute of ['media', 'title']) {
        if (node.hasAttribute(attribute)) style.setAttribute(attribute, node.getAttribute(attribute)!);
      }
      // Disabled and alternate sheets must not become active during inlining.
      if (node.hasAttribute('disabled') || rel.includes('alternate')) style.setAttribute('media', 'not all');
      node.replaceWith(style);
    } catch (error) {
      report(isSpecialUrl(href) ? 'blocked' : 'missing', href, error instanceof Error ? error.message : String(error));
      node.remove();
    }
  }
  for (const node of Array.from(doc.querySelectorAll('[style]'))) {
    node.setAttribute('style', await rewriteCssValue(node.getAttribute('style') || '', currentFileFolderPath, cssContext));
  }
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    if (!allowScripts) {
      if (script.getAttribute('src')) report('blocked', script.getAttribute('src')!, 'Document scripts are disabled');
      script.remove();
    } else if (script.hasAttribute('src')) {
      await processAttribute(script, 'src');
      if (!script.hasAttribute('src')) script.remove();
    }
  }
  for (const node of Array.from(doc.querySelectorAll('img, video, audio, source, track, input[type="image"], image'))) {
    for (const attribute of ['src', 'poster', 'href', 'xlink:href']) await processAttribute(node, attribute);
    if (node.hasAttribute('srcset')) {
      const candidates = await Promise.all(parseSrcset(node.getAttribute('srcset')!).map(async candidate => {
        const uri = await resolveAsset(candidate.url, currentFileFolderPath);
        return uri ? uri + (candidate.descriptor ? ` ${candidate.descriptor}` : '') : '';
      }));
      node.setAttribute('srcset', candidates.filter(Boolean).join(', '));
    }
  }
  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading, index) => {
    // A dedicated identifier avoids collisions with document-provided ids.
    const id = `html-viewer-heading-${token}-${index}`;
    heading.setAttribute('data-html-viewer-heading', id);
    return { id, text: (heading.textContent || '').trim().slice(0, 300), level: Number(heading.tagName.slice(1)) };
  });

  // Ensure <head> exists (the HTML parser supplies one even for fragments).
  const head = doc.head;
  // Gather allowed sources for CSP. Vault assets are embedded by the host, never fetched remotely.
  const policy = [
    "default-src 'none'", "base-uri 'none'", "connect-src 'none'", "form-action 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'",
    `script-src ${allowScripts ? "'unsafe-inline' data: blob:" : `'nonce-${token}'`}`,
    `script-src-attr ${allowScripts ? "'unsafe-inline'" : "'none'"}`,
    "style-src 'unsafe-inline'", "img-src data: blob:", "media-src data: blob:", "font-src data: blob:"
  ].join('; ') + ';';
  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', policy);
  head.prepend(csp);

  // Inject IPC Script ahead of document scripts. Only this script runs in script-disabled mode.
  const bridge = doc.createElement('script');
  bridge.setAttribute('nonce', token);
  bridge.textContent = getClickInterceptorScript(token);
  csp.after(bridge);
  return {
    transformedHtml: (doc.doctype ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML,
    assetPaths: [...assetPaths],
    diagnostics,
    headings
  };
}
