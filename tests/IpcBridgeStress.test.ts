import { IpcBridge } from '../src/ipc/IpcBridge';

describe('IpcBridge Empirical Stress Testing Harness', () => {
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

  describe('Adversarial Path Traversal Stress Tests', () => {
    test('neutralizes complex, recursive, mixed-slash, and url-encoded path traversal attacks', () => {
      ipcBridge.attach();

      const testCases = [
        { input: '..%2fsecret.md', expected: 'secret.md' },
        { input: '....//secret.md', expected: 'secret.md' },
        { input: '..%2f..%2fetc/passwd', expected: 'etc/passwd' },
        { input: '..%5c..%5cwindows/system32', expected: 'windows/system32' },
        { input: '....\\\\....\\\\secret.txt', expected: 'secret.txt' },
        { input: '%2e%2e%2f%2e%2e%2fconfig', expected: 'config' },
        { input: '////absolute/path.md', expected: 'absolute/path.md' },
        { input: '..//..//..//var/log/syslog', expected: 'var/log/syslog' },
        { input: 'subfolder/..%2f..%2ftarget.md', expected: 'subfolder/target.md' },
        { input: '..../....//....//deep/file.md', expected: 'deep/file.md' }
      ];

      testCases.forEach(({ input, expected }) => {
        mockApp.workspace.openLinkText.mockClear();
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-navigate', linkText: input },
          source: fakeWindow
        });
        window.dispatchEvent(event);
        expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith(
          expected,
          'folder/current.html',
          false
        );
      });
    });
  });

  describe('Adversarial Message Spoofing Stress Tests', () => {
    test('rejects messages from global window, unattached frames, and mismatched sources', () => {
      ipcBridge.attach();

      // 1. Message from top window
      const topWindowEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'spoofed.md' },
        source: window
      });
      window.dispatchEvent(topWindowEvent);
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();

      // 2. Message from another mock window object
      const rogueWindow = {} as Window;
      const rogueEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'rogue.md' },
        source: rogueWindow
      });
      window.dispatchEvent(rogueEvent);
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();

      // 3. Message when contentWindow is null
      Object.defineProperty(mockIframe, 'contentWindow', { value: null, writable: true });
      const nullWinEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'nullwin.md' },
        source: fakeWindow
      });
      window.dispatchEvent(nullWinEvent);
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();
    });
  });

  describe('Adversarial External Scheme Stress Tests', () => {
    test('strictly permits http, https, and mailto while blocking malicious schemes', () => {
      ipcBridge.attach();

      const allowedUrls = [
        'HTTP://example.com',
        'Https://secure.example.org/test?a=1',
        'MAILTO:admin@domain.com',
        '  https://trimmed.com  ',
        'http://localhost:8080/path'
      ];

      allowedUrls.forEach(url => {
        (window.open as jest.Mock).mockClear();
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-open-external', url },
          source: fakeWindow
        });
        window.dispatchEvent(event);
        expect(window.open).toHaveBeenCalledWith(url.trim(), '_blank');
      });

      const blockedUrls = [
        'javascript:alert(document.cookie)',
        'JAVASCRIPT:console.log(1)',
        'file:///etc/passwd',
        'FILE://C:/Windows/System32/drivers/etc/hosts',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'blob:http://example.com/uuid',
        'vbscript:msgbox',
        '  javascript:void(0)'
      ];

      blockedUrls.forEach(url => {
        (window.open as jest.Mock).mockClear();
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-open-external', url },
          source: fakeWindow
        });
        window.dispatchEvent(event);
        expect(window.open).not.toHaveBeenCalled();
      });
    });
  });
});
