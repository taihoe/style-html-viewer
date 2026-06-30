import { HtmlView, VIEW_TYPE_HTML } from '../src/view/HtmlView';
import { IpcBridge } from '../src/ipc/IpcBridge';

describe('Challenger M3-2 Empirical Stress Harness: Sandbox Boundaries, Script Execution, IPC, & Refresh', () => {
  let mockApp: any;
  let mockLeaf: any;
  let mockFile: any;
  let htmlView: HtmlView;

  beforeEach(() => {
    document.body.innerHTML = '';
    const contentEl = document.createElement('div');
    const containerEl = document.createElement('div');
    containerEl.appendChild(document.createElement('div'));
    containerEl.appendChild(contentEl);

    mockLeaf = {
      view: null,
      app: null
    };

    mockFile = {
      path: 'notes/dashboard.html',
      basename: 'dashboard',
      extension: 'html',
      parent: { path: 'notes' }
    };

    mockApp = {
      vault: {
        read: jest.fn().mockResolvedValue('<html><body><h1>Test Dashboard</h1></body></html>'),
        getAbstractFileByPath: jest.fn().mockReturnValue(mockFile),
        getResourcePath: jest.fn().mockImplementation((f: any) => `app://local-vault/${f.path}`),
        on: jest.fn().mockReturnValue({ id: 'listener' })
      },
      workspace: {
        openLinkText: jest.fn()
      }
    };

    htmlView = new HtmlView(mockLeaf);
    (htmlView as any).app = mockApp;
    (htmlView as any).contentEl = contentEl;
    (htmlView as any).containerEl = containerEl;
  });

  describe('1. Iframe Sandbox DOM Security Boundaries & Escape Analysis', () => {
    test('1.1 Sandbox attribute enforces allow-scripts allow-forms allow-same-origin allow-modals explicitly', async () => {
      await htmlView.onLoadFile(mockFile);
      const container = (htmlView as any).contentEl;
      const iframe = container.querySelector('iframe.html-viewer-iframe') as HTMLIFrameElement;
      
      expect(iframe).not.toBeNull();
      const sandboxAttr = iframe.getAttribute('sandbox');
      expect(sandboxAttr).toBe('allow-scripts allow-forms allow-same-origin allow-modals');
    });

    test('1.2 Empirical challenge: sandbox does NOT grant allow-top-navigation or allow-popups', async () => {
      await htmlView.onLoadFile(mockFile);
      const container = (htmlView as any).contentEl;
      const iframe = container.querySelector('iframe.html-viewer-iframe') as HTMLIFrameElement;
      const sandboxAttr = iframe.getAttribute('sandbox') || '';

      expect(sandboxAttr).not.toContain('allow-top-navigation');
      expect(sandboxAttr).not.toContain('allow-popups');
      expect(sandboxAttr).not.toContain('allow-pointer-lock');
    });

    test('1.3 Security analysis: allow-same-origin and allow-scripts combination vulnerability check', async () => {
      await htmlView.onLoadFile(mockFile);
      const container = (htmlView as any).contentEl;
      const iframe = container.querySelector('iframe.html-viewer-iframe') as HTMLIFrameElement;
      const sandboxTokens = (iframe.getAttribute('sandbox') || '').split(' ');

      const hasSameOrigin = sandboxTokens.includes('allow-same-origin');
      const hasScripts = sandboxTokens.includes('allow-scripts');

      // Documenting empirical finding: both tokens are active simultaneously without origin isolation
      expect(hasSameOrigin && hasScripts).toBe(true);
    });
  });

  describe('2. Script Execution in Sandbox vs Source Mode & Mode Switching', () => {
    test('2.1 Source mode renders malicious scripts as safe text without executing or creating script DOM elements', async () => {
      const maliciousHtml = `<script>window.pwned=true; alert("xss");</script><img src="x" onerror="window.pwned2=true;">`;
      mockApp.vault.read.mockResolvedValue(maliciousHtml);

      await htmlView.onLoadFile(mockFile);
      (htmlView as any).mode = 'source';
      await (htmlView as any).renderView();

      const container = (htmlView as any).contentEl;
      const preEl = container.querySelector('pre.html-viewer-source-container');
      expect(preEl).not.toBeNull();
      expect(preEl.textContent).toBe(maliciousHtml);

      // Verify no script or img elements were appended inside contentEl
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect((window as any).pwned).toBeUndefined();
      expect((window as any).pwned2).toBeUndefined();
    });

    test('2.2 Rapid mode switching cleans container completely without orphan elements', async () => {
      await htmlView.onLoadFile(mockFile);
      const container = (htmlView as any).contentEl;

      // Initial state: preview mode (iframe)
      expect(container.querySelectorAll('iframe').length).toBe(1);
      expect(container.querySelectorAll('pre').length).toBe(0);

      // Switch to source mode
      (htmlView as any).mode = 'source';
      await (htmlView as any).renderView();
      expect(container.querySelectorAll('iframe').length).toBe(0);
      expect(container.querySelectorAll('pre').length).toBe(1);

      // Switch back to preview mode
      (htmlView as any).mode = 'preview';
      await (htmlView as any).renderView();
      expect(container.querySelectorAll('iframe').length).toBe(1);
      expect(container.querySelectorAll('pre').length).toBe(0);
    });
  });

  describe('3. Unexpected Message Events & IPC Stress Testing (IpcBridge)', () => {
    let ipcBridge: IpcBridge;

    beforeEach(() => {
      ipcBridge = new IpcBridge(mockApp, () => mockFile.path);
      const mockIframe = {
        contentWindow: window
      } as any;
      ipcBridge.setIframe(mockIframe);
      ipcBridge.attach();
    });

    afterEach(() => {
      ipcBridge.detach();
    });

    test('3.1 Unexpected message payloads (null, undefined, primitives) do not throw errors', () => {
      expect(() => {
        window.postMessage(null as any, '*');
        window.postMessage('string-payload' as any, '*');
        window.postMessage(12345 as any, '*');
        window.postMessage(true as any, '*');
      }).not.toThrow();
    });

    test('3.2 Malicious obsidian-open-external payload with javascript: URL schema', () => {
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
      
      const maliciousEvent = new MessageEvent('message', {
        data: { type: 'obsidian-open-external', url: 'javascript:alert(document.cookie)' },
        source: window
      });
      window.dispatchEvent(maliciousEvent);

      // Verification: URL scheme validation blocks javascript: URI
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });

    test('3.3 Malicious obsidian-open-external payload with file:// protocol or local filesystem targets', () => {
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
      
      const maliciousEvent = new MessageEvent('message', {
        data: { type: 'obsidian-open-external', url: 'file:///etc/passwd' },
        source: window
      });
      window.dispatchEvent(maliciousEvent);

      // Verification: URL scheme validation blocks file:// URI
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });

    test('3.4 Malicious obsidian-navigate payload with directory traversal linkText', () => {
      const maliciousEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '../../../../etc/shadow' },
        source: window
      });
      window.dispatchEvent(maliciousEvent);

      // Verification: Link text is sanitized of directory traversal sequences
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith(
        'etc/shadow',
        'notes/dashboard.html',
        false
      );
    });

    test('3.5 Lack of try-catch in IpcBridge handler allows exceptions from workspace.openLinkText to propagate unhandled', () => {
      mockApp.workspace.openLinkText.mockImplementationOnce(() => {
        throw new Error('Workspace open failure');
      });

      const handler = (ipcBridge as any).messageHandler;
      expect(handler).toBeDefined();

      const navEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'test.md' },
        source: window
      });

      // Verification: Try-catch error boundary prevents exception propagation
      expect(() => {
        handler(navEvent);
      }).not.toThrow();
    });
  });

  describe('4. Refresh Behavior & Asynchronous Error Recovery', () => {
    test('4.1 Rapid refresh actions recreate clean preview iframe', async () => {
      await htmlView.onLoadFile(mockFile);
      const container = (htmlView as any).contentEl;

      // Trigger multiple reloads consecutively
      await (htmlView as any).renderView();
      await (htmlView as any).renderView();
      await (htmlView as any).renderView();

      expect(container.querySelectorAll('iframe').length).toBe(1);
    });

    test('4.2 Vault read failure displays sanitized error UI without html injection', async () => {
      const errorMsg = '<img src=x onerror=alert(1)> Read Error';
      mockApp.vault.read.mockRejectedValueOnce(new Error(errorMsg));

      await htmlView.onLoadFile(mockFile);
      const container = (htmlView as any).contentEl;

      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      
      const errorMessageDiv = errorContainer.querySelector('.html-viewer-error-message');
      expect(errorMessageDiv).not.toBeNull();
      expect(errorMessageDiv.textContent).toBe(errorMsg);
      expect(errorMessageDiv.innerHTML).not.toContain('<img');
    });
  });
});
