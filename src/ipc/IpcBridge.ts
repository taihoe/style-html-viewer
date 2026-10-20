import { App } from 'obsidian';
import { folderOf, isSpecialUrl, resolveVaultPath, splitUrl } from '../engine/paths';
import previewStyles from '../../styles.css';

export interface IpcNavigatePayload { type: 'obsidian-navigate'; linkText: string; token?: string; newLeaf?: boolean }
export interface IpcOpenExternalPayload { type: 'obsidian-open-external'; url: string; token?: string }
export type IpcPayload = IpcNavigatePayload | IpcOpenExternalPayload;
export type PreviewCommand =
  | { action: 'find'; query: string }
  | { action: 'next'; direction: -1 | 1 }
  | { action: 'heading'; id: string }
  | { action: 'print' };
export interface PreviewMessage { type: string; [key: string]: unknown }

/** Self-contained code serialized into the opaque preview; it never accesses parent DOM. */
function previewRuntime(token: string, styles: string): void {
  const send = (data: Record<string, unknown>) => window.parent.postMessage({ ...data, token }, '*');
  // The opaque iframe has no Obsidian DOM extensions. Clone a fixed, inert template
  // within this document instead of depending on the host's createEl helpers.
  const markTemplate = new DOMParser().parseFromString('<mark class="html-viewer-match"></mark>', 'text/html').querySelector('mark')!;
  let marks: HTMLElement[] = [];
  let current = -1;
  const reportMatches = () => send({ type: 'html-viewer-find', count: marks.length, current: current + 1 });
  const selectMatch = (direction: number) => {
    if (marks.length) {
      if (current >= 0) marks[current].classList.remove('html-viewer-current-match');
      current = (current + direction + marks.length) % marks.length;
      marks[current].classList.add('html-viewer-current-match');
      marks[current].scrollIntoView({ block: 'center' });
    }
    reportMatches();
  };
  const clearMatches = () => {
    for (const mark of marks) {
      const parent = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
      parent?.normalize();
    }
    marks = [];
    current = -1;
  };
  document.addEventListener('click', e => {
    const anchor = e.target instanceof Element ? e.target.closest('a') : null;
    const href = anchor?.getAttribute('href')?.trim();
    if (!href || href.startsWith('#')) return;
    e.preventDefault();
    if (!e.isTrusted) return;
    if (/^(https?:|mailto:)/i.test(href)) send({ type: 'obsidian-open-external', url: href });
    else send({ type: 'obsidian-navigate', linkText: href, newLeaf: e.ctrlKey || e.metaKey || e.shiftKey });
  }, true);
  document.addEventListener('submit', e => e.preventDefault(), true);
  document.addEventListener('securitypolicyviolation', e => {
    send({ type: 'html-viewer-diagnostic', path: e.blockedURI || 'Inline content', message: `Blocked by ${e.effectiveDirective}` });
  });
  window.addEventListener('error', e => {
    const target = e.target;
    if (target instanceof Element) send({ type: 'html-viewer-diagnostic', path: target.getAttribute('src') || target.tagName, message: 'Resource failed to load' });
    else if (e instanceof ErrorEvent) send({ type: 'html-viewer-diagnostic', path: e.filename || 'Document script', message: e.message });
  }, true);
  window.addEventListener('afterprint', () => send({ type: 'html-viewer-ready' }));
  window.addEventListener('message', (e: MessageEvent<unknown>) => {
    const input = e.data;
    if (e.source !== window.parent || !input || typeof input !== 'object' || Array.isArray(input)) return;
    const data = input as Record<string, unknown>;
    if (data.type !== 'html-viewer-command' || data.token !== token) return;
    if (data.action === 'find' && typeof data.query === 'string') {
      clearMatches();
      const query = data.query.slice(0, 300).toLowerCase();
      if (query && document.body) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (parent && !parent.closest('script,style,noscript,textarea,input,select,[hidden]') && parent.getClientRects().length) nodes.push(node as Text);
        }
        for (const text of nodes) {
          const value = text.data;
          const lower = value.toLowerCase();
          let start = 0;
          let index = lower.indexOf(query);
          if (index < 0) continue;
          const fragment = new DocumentFragment();
          while (index >= 0 && marks.length < 1000) {
            fragment.append(document.createTextNode(value.slice(start, index)));
            const mark = document.importNode(markTemplate, true);
            mark.textContent = value.slice(index, index + query.length);
            fragment.append(mark);
            marks.push(mark);
            start = index + query.length;
            index = lower.indexOf(query, start);
          }
          fragment.append(document.createTextNode(value.slice(start)));
          text.replaceWith(fragment);
          if (marks.length >= 1000) break;
        }
      }
      selectMatch(1);
    } else if (data.action === 'next' && (data.direction === -1 || data.direction === 1)) selectMatch(data.direction);
    else if (data.action === 'heading' && typeof data.id === 'string') {
      const heading = Array.from(document.querySelectorAll('[data-html-viewer-heading]')).find(el => el.getAttribute('data-html-viewer-heading') === data.id);
      heading?.scrollIntoView({ block: 'start' });
    } else if (data.action === 'print') {
      clearMatches();
      reportMatches();
      window.print();
    }
  });
  const ready = () => {
    // Obsidian loads styles.css for the host. Its CSS cannot cross the iframe
    // boundary, so adopt the same bundled file here without injecting style tags.
    // Older WebViews still have native <mark> highlighting if adoption is unavailable.
    if ('adoptedStyleSheets' in document && typeof CSSStyleSheet.prototype.replaceSync === 'function') {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(styles);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
    send({ type: 'html-viewer-ready' });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
}

export function getClickInterceptorScript(token = ''): string {
  // Keep serialized arguments inside the script even if CSS contains an HTML closing tag.
  const args = [token, previewStyles].map(value => JSON.stringify(value).replace(/</g, '\\u003c')).join(',');
  return `(${previewRuntime.toString()})(${args});`;
}
export const IPC_SCRIPT_TEMPLATE = getClickInterceptorScript();

export class IpcBridge {
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private iframeEl: HTMLIFrameElement | null = null;
  private token = '';
  private hostWindow: Window;

  constructor(
    private app: App,
    private getSourcePath: () => string,
    private onMessage: (data: PreviewMessage) => void = () => {},
    hostWindow: Window = window
  ) { this.hostWindow = hostWindow; }

  public setIframe(iframeEl: HTMLIFrameElement | null, token = ''): void {
    this.iframeEl = iframeEl;
    this.token = token;
    const owner = iframeEl?.ownerDocument?.defaultView;
    if (owner && owner !== this.hostWindow) {
      const attached = Boolean(this.messageHandler);
      this.detach();
      this.hostWindow = owner;
      if (attached) this.attach();
    }
  }

  public send(command: PreviewCommand): void {
    this.iframeEl?.contentWindow?.postMessage({ type: 'html-viewer-command', token: this.token, ...command }, '*');
  }

  public attach(iframeEl?: HTMLIFrameElement | null): void {
    if (iframeEl !== undefined) this.setIframe(iframeEl);
    if (this.messageHandler) return;
    this.messageHandler = event => {
      try {
        const data: unknown = event.data;
        if (!data || typeof data !== 'object' || !('type' in data)) return;
        if (!this.iframeEl?.contentWindow || event.source !== this.iframeEl.contentWindow) return;
        const payload = data as PreviewMessage;
        if (this.token && payload.token !== this.token) return;
        if (payload.type === 'obsidian-navigate' && typeof payload.linkText === 'string') {
          const link = payload.linkText.trim();
          if (!link || isSpecialUrl(link)) return;
          const { path, suffix } = splitUrl(link);
          const sourcePath = this.getSourcePath();
          const target = resolveVaultPath(folderOf(sourcePath), path) + suffix;
          // Promise rejections need their own boundary; synchronous try/catch is insufficient.
          Promise.resolve(this.app.workspace.openLinkText(target, sourcePath, payload.newLeaf === true)).catch(error => {
            this.onMessage({ type: 'html-viewer-diagnostic', path: link, message: String(error) });
          });
        } else if (payload.type === 'obsidian-open-external' && typeof payload.url === 'string') {
          const url = payload.url.trim();
          if (/^(https?:\/\/|mailto:)/i.test(url)) this.hostWindow.open(url, '_blank', 'noopener,noreferrer');
        } else if (payload.type.startsWith('html-viewer-')) this.onMessage(payload);
      } catch (error) {
        // Safe error boundary for unexpected exceptions and invalid paths.
        this.onMessage({ type: 'html-viewer-diagnostic', path: 'Navigation', message: String(error) });
      }
    };
    this.hostWindow.addEventListener('message', this.messageHandler);
  }

  public detach(): void {
    if (this.messageHandler) this.hostWindow.removeEventListener('message', this.messageHandler);
    this.messageHandler = null;
  }
}
