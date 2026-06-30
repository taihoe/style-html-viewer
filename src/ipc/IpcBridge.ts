import { App } from 'obsidian';

export interface IpcNavigatePayload {
  type: 'obsidian-navigate';
  linkText: string;
}

export interface IpcOpenExternalPayload {
  type: 'obsidian-open-external';
  url: string;
}

export type IpcPayload = IpcNavigatePayload | IpcOpenExternalPayload;

export function getClickInterceptorScript(): string {
  return `
(function() {
  document.addEventListener('click', function(e) {
    var anchor = e.target.closest ? e.target.closest('a') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;

    var lowerHref = href.toLowerCase();
    if (lowerHref.startsWith('http://') || lowerHref.startsWith('https://') || lowerHref.startsWith('mailto:')) {
      e.preventDefault();
      window.parent.postMessage({ type: 'obsidian-open-external', url: href }, '*');
    } else {
      e.preventDefault();
      window.parent.postMessage({ type: 'obsidian-navigate', linkText: href }, '*');
    }
  }, true);
})();
`;
}

export const IPC_SCRIPT_TEMPLATE = getClickInterceptorScript();


export class IpcBridge {
  private app: App;
  private getSourcePath: () => string;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private iframeEl: HTMLIFrameElement | null = null;

  constructor(app: App, getSourcePath: () => string) {
    this.app = app;
    this.getSourcePath = getSourcePath;
  }

  public setIframe(iframeEl: HTMLIFrameElement | null): void {
    this.iframeEl = iframeEl;
  }

  public attach(iframeEl?: HTMLIFrameElement | null): void {
    if (iframeEl !== undefined) {
      this.iframeEl = iframeEl;
    }
    if (this.messageHandler) return;
    this.messageHandler = (event: MessageEvent) => {
      try {
        const data = event.data as IpcPayload;
        if (!data || typeof data !== 'object') return;

        if (!this.iframeEl || !this.iframeEl.contentWindow || event.source !== this.iframeEl.contentWindow) {
          return;
        }

        if (data.type === 'obsidian-navigate') {
          if (typeof data.linkText !== 'string') return;
          let sanitizedLinkText = data.linkText;
          try {
            sanitizedLinkText = decodeURIComponent(sanitizedLinkText);
          } catch {
            // Ignore decoding errors
          }
          sanitizedLinkText = sanitizedLinkText.replace(/%2f/gi, '/').replace(/%5c/gi, '\\');
          let prev: string;
          do {
            prev = sanitizedLinkText;
            sanitizedLinkText = sanitizedLinkText.replace(/\.\./g, '').replace(/[/\\]+/g, '/');
          } while (sanitizedLinkText !== prev);
          sanitizedLinkText = sanitizedLinkText.replace(/^\/+/, '');

          const sourcePath = this.getSourcePath();
          if (this.app && this.app.workspace && typeof this.app.workspace.openLinkText === 'function') {
            this.app.workspace.openLinkText(sanitizedLinkText, sourcePath, false);
          }
        } else if (data.type === 'obsidian-open-external') {
          if (typeof data.url !== 'string') return;
          const trimmedUrl = data.url.trim();
          const lowerUrl = trimmedUrl.toLowerCase();
          if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://') || lowerUrl.startsWith('mailto:')) {
            window.open(trimmedUrl, '_blank');
          }
        }
      } catch {
        // Safe error boundary for unexpected exceptions
      }
    };
    window.addEventListener('message', this.messageHandler);
  }

  public detach(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
  }
}
