import { IpcBridge, getClickInterceptorScript, IPC_SCRIPT_TEMPLATE } from '../src/ipc/IpcBridge';
import { resolveHtmlAssets } from '../src/engine/HtmlAssetResolver';

describe('IpcBridge & Link Interception Unit Tests', () => {
  let mockApp: any;
  let getSourcePathMock: jest.Mock<string, []>;
  let ipcBridge: IpcBridge;
  let originalWindowOpen: typeof window.open;
  let mockIframe: HTMLIFrameElement;
  let fakeWindow: Window;

  beforeEach(() => {
    getSourcePathMock = jest.fn().mockReturnValue('folder/current.html');
    mockApp = {
      workspace: {
        openLinkText: jest.fn()
      }
    };
    ipcBridge = new IpcBridge(mockApp, getSourcePathMock);
    fakeWindow = {} as Window;
    mockIframe = document.createElement('iframe');
    Object.defineProperty(mockIframe, 'contentWindow', {
      value: fakeWindow,
      writable: true
    });
    ipcBridge.setIframe(mockIframe);
    originalWindowOpen = window.open;
    window.open = jest.fn();
  });

  afterEach(() => {
    ipcBridge.detach();
    window.open = originalWindowOpen;
    jest.clearAllMocks();
  });

  describe('Script Generation & Injection', () => {
    test('getClickInterceptorScript returns client script handling clicks on links', () => {
      const script = getClickInterceptorScript();
      expect(typeof script).toBe('string');
      expect(script).toContain("document.addEventListener('click'");
      expect(script).toContain("closest('a')");
      expect(script).toContain("type: 'obsidian-open-external'");
      expect(script).toContain("type: 'obsidian-navigate'");
      expect(script).toContain("if (href.startsWith('#')) return;");
      expect(script).toContain("mailto:");
      expect(script).toContain("}, true);");
      expect(IPC_SCRIPT_TEMPLATE).toBe(script);
    });

    test('HtmlAssetResolver injects click interceptor script into transformed HTML', () => {
      const rawHtml = '<html><head></head><body><a href="target.md">Link</a></body></html>';
      const result = resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'folder',
        getResourcePathFn: (p) => p
      });

      expect(result.transformedHtml).toContain(getClickInterceptorScript());
    });
  });

  describe('IpcBridge message handling (attach, navigate, open-external)', () => {
    test('should process obsidian-navigate payload and call app.workspace.openLinkText', () => {
      ipcBridge.attach();

      const event = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'notes/target.md' },
        source: fakeWindow
      });
      window.dispatchEvent(event);

      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith(
        'notes/target.md',
        'folder/current.html',
        false
      );
    });

    test('should process obsidian-open-external payload and call window.open for http/https/mailto URLs with case insensitivity', () => {
      ipcBridge.attach();

      const httpEvent = new MessageEvent('message', {
        data: { type: 'obsidian-open-external', url: 'HTTP://example.com' },
        source: fakeWindow
      });
      window.dispatchEvent(httpEvent);
      expect(window.open).toHaveBeenCalledWith('HTTP://example.com', '_blank');

      const httpsEvent = new MessageEvent('message', {
        data: { type: 'obsidian-open-external', url: 'Https://example.org/path?q=1' },
        source: fakeWindow
      });
      window.dispatchEvent(httpsEvent);
      expect(window.open).toHaveBeenCalledWith('Https://example.org/path?q=1', '_blank');

      const mailtoEvent = new MessageEvent('message', {
        data: { type: 'obsidian-open-external', url: 'MAILTO:test@example.com' },
        source: fakeWindow
      });
      window.dispatchEvent(mailtoEvent);
      expect(window.open).toHaveBeenCalledWith('MAILTO:test@example.com', '_blank');
    });

    test('should strictly require iframe contentWindow matching event source', () => {
      ipcBridge.attach();

      // Message from untrusted window (e.g., global window)
      const untrustedEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'untrusted.md' },
        source: window
      });
      window.dispatchEvent(untrustedEvent);
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();

      // Unset iframe completely
      ipcBridge.setIframe(null);
      const unboundEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'unbound.md' },
        source: fakeWindow
      });
      window.dispatchEvent(unboundEvent);
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();
    });

    test('should stop handling messages after detach()', () => {
      ipcBridge.attach();
      ipcBridge.detach();

      const event = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'test.md' },
        source: fakeWindow
      });
      window.dispatchEvent(event);

      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();
    });
  });

  describe('Error handling & Path traversal validation', () => {
    test('should sanitize path traversal sequences and URL-encoded bypasses in linkText', () => {
      ipcBridge.attach();

      const payloadTraversal1 = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '../../secret.md' },
        source: fakeWindow
      });
      window.dispatchEvent(payloadTraversal1);
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith('secret.md', 'folder/current.html', false);

      const payloadTraversal2 = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '....//secret.md' },
        source: fakeWindow
      });
      window.dispatchEvent(payloadTraversal2);
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith('secret.md', 'folder/current.html', false);

      const payloadTraversal3 = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '..%2fsecret.md' },
        source: fakeWindow
      });
      window.dispatchEvent(payloadTraversal3);
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith('secret.md', 'folder/current.html', false);

      const payloadTraversal4 = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '/absolute/path/doc.md' },
        source: fakeWindow
      });
      window.dispatchEvent(payloadTraversal4);
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith('absolute/path/doc.md', 'folder/current.html', false);
    });

    test('should safely ignore non-object or invalid data payloads', () => {
      ipcBridge.attach();

      [null, undefined, 123, 'string-payload', {}, { type: 'unknown-type' }].forEach(data => {
        const event = new MessageEvent('message', { data, source: fakeWindow });
        expect(() => window.dispatchEvent(event)).not.toThrow();
      });

      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();
      expect(window.open).not.toHaveBeenCalled();
    });

    test('should ignore non-string linkText or url parameters', () => {
      ipcBridge.attach();

      const invalidNav = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 12345 },
        source: fakeWindow
      });
      window.dispatchEvent(invalidNav);
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();

      const invalidExt = new MessageEvent('message', {
        data: { type: 'obsidian-open-external', url: null },
        source: fakeWindow
      });
      window.dispatchEvent(invalidExt);
      expect(window.open).not.toHaveBeenCalled();
    });

    test('should reject unsafe external schemes (file://, javascript:, etc.)', () => {
      ipcBridge.attach();

      const unsafeSchemes = [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'data:text/html,<script>alert(1)</script>',
        'ftp://example.com'
      ];

      unsafeSchemes.forEach(url => {
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-open-external', url },
          source: fakeWindow
        });
        window.dispatchEvent(event);
      });

      expect(window.open).not.toHaveBeenCalled();
    });

    test('should handle exceptions thrown inside messageHandler gracefully', () => {
      ipcBridge.attach();
      mockApp.workspace.openLinkText.mockImplementation(() => {
        throw new Error('Unexpected workspace error');
      });

      const event = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'error.md' },
        source: fakeWindow
      });

      expect(() => window.dispatchEvent(event)).not.toThrow();
    });
  });
});
