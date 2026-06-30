export interface ResolveHtmlAssetsOptions {
  /** Raw HTML document string */
  rawHtml: string;
  /** Relative directory path of the active HTML file within the vault (e.g., "lessons" or "") */
  currentFileFolderPath: string;
  /** Injected function resolving normalized vault path to resource URI */
  getResourcePathFn: (vaultPath: string) => string;
}

export interface ResolveHtmlAssetsResult {
  /** The transformed HTML document string with updated URLs, CSP, and IPC script */
  transformedHtml: string;
  /** List of relative vault file paths discovered and transformed (used for live reload dependency tracking) */
  assetPaths: string[];
}

import { getClickInterceptorScript, IPC_SCRIPT_TEMPLATE } from '../ipc/IpcBridge';

function isExternalOrSpecialUrl(url: string): boolean {
  if (!url) return true;
  const trimmed = url.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('?')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    return true;
  }
  return false;
}

function splitUrl(url: string): { basePath: string; queryHashSuffix: string } {
  const qIdx = url.indexOf('?');
  const hIdx = url.indexOf('#');
  let splitIdx = -1;
  if (qIdx !== -1 && hIdx !== -1) {
    splitIdx = Math.min(qIdx, hIdx);
  } else if (qIdx !== -1) {
    splitIdx = qIdx;
  } else if (hIdx !== -1) {
    splitIdx = hIdx;
  }

  if (splitIdx !== -1) {
    return {
      basePath: url.slice(0, splitIdx),
      queryHashSuffix: url.slice(splitIdx)
    };
  }
  return { basePath: url, queryHashSuffix: '' };
}

function normalizeVaultPath(baseFolder: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    const relParts = relativePath.split('/');
    const stack: string[] = [];
    for (const part of relParts) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join('/');
  }

  const baseParts = baseFolder ? baseFolder.split('/').filter(p => p.length > 0 && p !== '.') : [];
  const relParts = relativePath.split('/');
  
  const stack = [...baseParts];
  for (const part of relParts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

function processSrcset(
  srcsetVal: string,
  currentFileFolderPath: string,
  getResourcePathFn: (vaultPath: string) => string,
  assetPaths: string[],
  resolvedUris?: string[]
): string {
  const candidates = srcsetVal.split(',');
  const processedCandidates = candidates.map(candidate => {
    const trimmed = candidate.trim();
    if (!trimmed) return candidate;
    const match = trimmed.match(/^(\S+)(\s+[\s\S]+)?$/);
    if (!match) return candidate;
    const rawUrl = match[1];
    const descriptor = match[2] || '';
    if (isExternalOrSpecialUrl(rawUrl)) {
      return candidate;
    }
    const { basePath, queryHashSuffix } = splitUrl(rawUrl);
    const vaultPath = normalizeVaultPath(currentFileFolderPath, basePath);
    assetPaths.push(vaultPath);
    const resolvedUri = getResourcePathFn(vaultPath) + queryHashSuffix;
    if (resolvedUris) {
      resolvedUris.push(resolvedUri);
    }
    return resolvedUri + descriptor;
  });
  return processedCandidates.join(', ');
}

function extractCspSource(uri: string): string | null {
  if (!uri) return null;
  const match = uri.match(/^([a-z][a-z0-9+.-]*:\/\/[^\/]+)/i);
  if (match) {
    return match[1];
  }
  const schemeMatch = uri.match(/^([a-z][a-z0-9+.-]*:)/i);
  if (schemeMatch) {
    return schemeMatch[1];
  }
  return null;
}

/**
 * Pure function that parses HTML, transforms relative asset paths to vault resource URIs,
 * injects a Content Security Policy meta tag, and embeds the IPC click interception script.
 */
export function resolveHtmlAssets(options: ResolveHtmlAssetsOptions): ResolveHtmlAssetsResult {
  const { rawHtml, currentFileFolderPath, getResourcePathFn } = options;
  const assetPaths: string[] = [];
  const resolvedUris: string[] = [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  const processSingleAttribute = (el: Element, attrName: string) => {
    const attrVal = el.getAttribute(attrName);
    if (attrVal && !isExternalOrSpecialUrl(attrVal)) {
      const { basePath, queryHashSuffix } = splitUrl(attrVal);
      const vaultPath = normalizeVaultPath(currentFileFolderPath, basePath);
      assetPaths.push(vaultPath);
      const resolvedUri = getResourcePathFn(vaultPath) + queryHashSuffix;
      resolvedUris.push(resolvedUri);
      el.setAttribute(attrName, resolvedUri);
    }
  };

  const processSrcsetAttribute = (el: Element) => {
    const attrVal = el.getAttribute('srcset');
    if (attrVal) {
      const transformedSrcset = processSrcset(attrVal, currentFileFolderPath, getResourcePathFn, assetPaths, resolvedUris);
      el.setAttribute('srcset', transformedSrcset);
    }
  };

  // Process asset elements
  doc.querySelectorAll('link[href]').forEach(node => processSingleAttribute(node, 'href'));
  doc.querySelectorAll('script[src]').forEach(node => processSingleAttribute(node, 'src'));
  doc.querySelectorAll('img').forEach(node => {
    if (node.hasAttribute('src')) processSingleAttribute(node, 'src');
    if (node.hasAttribute('srcset')) processSrcsetAttribute(node);
  });
  doc.querySelectorAll('video').forEach(node => {
    if (node.hasAttribute('src')) processSingleAttribute(node, 'src');
    if (node.hasAttribute('poster')) processSingleAttribute(node, 'poster');
  });
  doc.querySelectorAll('audio').forEach(node => {
    if (node.hasAttribute('src')) processSingleAttribute(node, 'src');
  });
  doc.querySelectorAll('source').forEach(node => {
    if (node.hasAttribute('src')) processSingleAttribute(node, 'src');
    if (node.hasAttribute('srcset')) processSrcsetAttribute(node);
  });
  doc.querySelectorAll('iframe').forEach(node => {
    if (node.hasAttribute('src')) processSingleAttribute(node, 'src');
  });

  // Ensure <head> exists
  let head = doc.querySelector('head');
  if (!head) {
    head = doc.createElement('head');
    if (doc.documentElement) {
      doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
    }
  }

  // Gather allowed sources for CSP
  const allowedSources = new Set<string>(['app:', 'app://*', 'file:', 'data:', 'blob:']);
  for (const uri of resolvedUris) {
    const src = extractCspSource(uri);
    if (src) {
      allowedSources.add(src);
    }
  }

  // Inject or update CSP meta tag
  let cspMeta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (!cspMeta) {
    cspMeta = doc.createElement('meta');
    cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
    cspMeta.setAttribute('content', "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';");
    head.insertBefore(cspMeta, head.firstChild);
  }

  const cspContent = cspMeta.getAttribute('content') || '';
  const directiveMap = new Map<string, Set<string>>();
  const directives = cspContent.split(';').map(d => d.trim()).filter(d => d.length > 0);
  for (const dir of directives) {
    const parts = dir.split(/\s+/);
    const name = parts[0].toLowerCase();
    const values = parts.slice(1);
    directiveMap.set(name, new Set(values));
  }

  if (!directiveMap.has('default-src')) {
    directiveMap.set('default-src', new Set(["'self'"]));
  }

  const targetDirectives = ['default-src', 'script-src', 'style-src', 'img-src', 'media-src'];
  for (const target of targetDirectives) {
    if (directiveMap.has(target)) {
      const values = directiveMap.get(target)!;
      for (const src of allowedSources) {
        values.add(src);
      }
    }
  }

  const updatedDirectives: string[] = [];
  for (const [name, values] of directiveMap.entries()) {
    updatedDirectives.push(`${name} ${Array.from(values).join(' ')}`);
  }
  cspMeta.setAttribute('content', updatedDirectives.join('; ') + ';');

  // Inject IPC Script
  const ipcScript = doc.createElement('script');
  ipcScript.textContent = getClickInterceptorScript();
  head.appendChild(ipcScript);

  const hasDoctype = Boolean(doc.doctype) || /^\s*<!DOCTYPE\s+html/i.test(rawHtml);
  let transformedHtml = doc.documentElement ? doc.documentElement.outerHTML : doc.body.innerHTML;
  if (hasDoctype && !/^\s*<!DOCTYPE\s+html/i.test(transformedHtml)) {
    transformedHtml = '<!DOCTYPE html>\n' + transformedHtml;
  }

  return {
    transformedHtml,
    assetPaths: Array.from(new Set(assetPaths))
  };
}
