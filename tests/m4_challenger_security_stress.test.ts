import { IpcBridge } from '../src/ipc/IpcBridge';

describe('Milestone 4 Security & Stress Challenges (IPC Link Interception & Navigation)', () => {
  let mockApp: any;
  let getSourcePathMock: jest.Mock<string, []>;
  let ipcBridge: IpcBridge;
  let originalWindowOpen: typeof window.open;

  beforeEach(() => {
    getSourcePathMock = jest.fn().mockReturnValue('folder/current.html');
    mockApp = {
      workspace: {
        openLinkText: jest.fn()
      }
    };
    ipcBridge = new IpcBridge(mockApp, getSourcePathMock);
    const mockIframe = {
      contentWindow: window
    } as any;
    ipcBridge.setIframe(mockIframe);
    originalWindowOpen = window.open;
    window.open = jest.fn();
  });

  afterEach(() => {
    ipcBridge.detach();
    window.open = originalWindowOpen;
    jest.clearAllMocks();
  });

  describe('1. Path Traversal & Input Sanitization Bypasses (obsidian-navigate)', () => {
    test('CHALLENGE: Single-pass regex stripping bypass (....//secret.md)', () => {
      ipcBridge.attach();

      // Send payload with nested dots/slashes designed to bypass single-pass regex replace
      const event = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '....//secret.md' },
        source: window
      });
      window.dispatchEvent(event);

      // Flaw check: Single pass replace(/(\.\.[\/\\])+/g, '') leaves '../secret.md'
      const calledLink = mockApp.workspace.openLinkText.mock.calls[0]?.[0];
      expect(calledLink).not.toContain('..');
    });

    test('CHALLENGE: URL-encoded path traversal (..%2fsecret.md, ..%5csecret.md)', () => {
      ipcBridge.attach();

      const payloads = ['..%2fsecret.md', '..%2Fsecret.md', '..%5csecret.md', '%2e%2e%2fsecret.md'];
      payloads.forEach(linkText => {
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-navigate', linkText },
          source: window
        });
        window.dispatchEvent(event);
      });

      // Verification: Check if encoded traversal sequences are sanitized or passed raw
      mockApp.workspace.openLinkText.mock.calls.forEach((call: any[]) => {
        const arg = call[0];
        expect(arg).not.toContain('..');
        expect(arg).not.toContain('%2f');
        expect(arg).not.toContain('%2F');
      });
    });

    test('CHALLENGE: Mixed slashes and Windows style traversal (..\\..\\secret.md)', () => {
      ipcBridge.attach();

      const event = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '..\\..\\secret.md' },
        source: window
      });
      window.dispatchEvent(event);

      const calledLink = mockApp.workspace.openLinkText.mock.calls[0]?.[0];
      expect(calledLink).not.toContain('..');
    });
  });

  describe('2. URL Scheme Validation & Case Sensitivity (obsidian-open-external)', () => {
    test('CHALLENGE: Scheme case-sensitivity test (HTTP:// and HTTPS://)', () => {
      ipcBridge.attach();

      const validUppercaseUrls = [
        'HTTP://example.com',
        'HTTPS://example.com/path',
        'HttpS://example.org'
      ];

      validUppercaseUrls.forEach(url => {
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-open-external', url },
          source: window
        });
        window.dispatchEvent(event);
      });

      // Standard HTTP/HTTPS URLs in uppercase should be accepted and opened
      expect(window.open).toHaveBeenCalledTimes(validUppercaseUrls.length);
    });

    test('CHALLENGE: Unsafe scheme rejection (javascript:, data:, file:, vbscript:)', () => {
      ipcBridge.attach();

      const unsafeUrls = [
        'javascript:alert(1)',
        'javaScriPt:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'vbscript:msgbox(1)',
        'blob:https://example.com/uuid'
      ];

      unsafeUrls.forEach(url => {
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-open-external', url },
          source: window
        });
        window.dispatchEvent(event);
      });

      expect(window.open).not.toHaveBeenCalled();
    });
  });

  describe('3. Message Event Spoofing & Source Verification', () => {
    test('CHALLENGE: IPC handling when iframe reference is null (source mode / unattached iframe)', () => {
      // In source mode or before setIframe is called, iframeEl is null.
      ipcBridge.attach();
      ipcBridge.setIframe(null);

      const spoofedEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'malicious-nav.md' },
        source: window
      });
      window.dispatchEvent(spoofedEvent);

      // Security requirement: If iframe filter is active or expected, untrusted global window messages should not trigger navigation
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();
    });
  });

  describe('4. Synthetic Message Floods & Exception Resilience', () => {
    test('STRESS: Heavy synthetic message flood (5,000 messages)', () => {
      ipcBridge.attach();

      const start = Date.now();
      for (let i = 0; i < 5000; i++) {
        const event = new MessageEvent('message', {
          data: { type: 'obsidian-navigate', linkText: `note_${i}.md` },
          source: window
        });
        window.dispatchEvent(event);
      }
      const duration = Date.now() - start;

      expect(mockApp.workspace.openLinkText).toHaveBeenCalledTimes(5000);
      expect(duration).toBeLessThan(2000); // Must complete within 2s
    });

    test('RESILIENCE: Poisoned getters and throw-on-access payloads', () => {
      ipcBridge.attach();

      const poisonedPayloads = [
        {
          get type() {
            throw new Error('Poisoned type getter');
          }
        },
        {
          type: 'obsidian-navigate',
          get linkText() {
            throw new Error('Poisoned linkText getter');
          }
        },
        {
          type: 'obsidian-open-external',
          get url() {
            throw new Error('Poisoned url getter');
          }
        }
      ];

      poisonedPayloads.forEach(data => {
        const event = new MessageEvent('message', { data, source: window });
        expect(() => window.dispatchEvent(event)).not.toThrow();
      });
    });
  });
});
