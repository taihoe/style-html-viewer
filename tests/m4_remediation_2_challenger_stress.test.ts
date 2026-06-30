import { IpcBridge, getClickInterceptorScript, IPC_SCRIPT_TEMPLATE } from '../src/ipc/IpcBridge';

describe('Milestone 4 Remediation 2 - Empirical Stress Harness for Click Capture & DOM Handling', () => {
  let mockApp: any;
  let getSourcePathMock: jest.Mock<string, []>;
  let ipcBridge: IpcBridge;
  let originalWindowOpen: typeof window.open;
  let mockIframe: HTMLIFrameElement;
  let fakeWindow: Window;

  beforeEach(() => {
    getSourcePathMock = jest.fn().mockReturnValue('vault/current_note.html');
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
    document.body.innerHTML = '';
  });

  afterEach(() => {
    ipcBridge.detach();
    window.open = originalWindowOpen;
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  function setupDomAndInjectScript(htmlContent: string): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    const scriptText = getClickInterceptorScript();
    const scriptEl = document.createElement('script');
    scriptEl.textContent = scriptText;
    document.head.appendChild(scriptEl);

    return container;
  }

  describe('1. Click Interception Script Generation', () => {
    test('VERIFY: getClickInterceptorScript outputs correct IIFE string matching IPC_SCRIPT_TEMPLATE', () => {
      const script = getClickInterceptorScript();
      expect(typeof script).toBe('string');
      expect(script).toContain('(function() {');
      expect(script).toContain("document.addEventListener('click', function(e) {");
      expect(script).toContain('}, true);');
      expect(script).toContain("var anchor = e.target.closest ? e.target.closest('a') : null;");
      expect(script).toContain("if (href.startsWith('#')) return;");
      expect(IPC_SCRIPT_TEMPLATE).toBe(script);
    });
  });

  describe('2. Capture Phase Event Listener Behavior', () => {
    test('VERIFY: document capture phase listener executes before element-level bubble handlers', () => {
      const container = setupDomAndInjectScript(`
        <a id="test-link" href="target.md">
          <span id="child-span">Click Target</span>
        </a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');
      const span = container.querySelector('#child-span')!;

      let bubbleExecuted = false;
      span.addEventListener('click', () => {
        bubbleExecuted = true;
      }, false);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      span.dispatchEvent(event);

      // Document capture listener intercepted and prevented default
      expect(event.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: 'target.md' },
        '*'
      );
      expect(bubbleExecuted).toBe(true);
      postMessageSpy.mockRestore();
    });

    test('VERIFY: document capture phase fires even if bubble phase is stopped downstream', () => {
      const container = setupDomAndInjectScript(`
        <a id="test-link" href="target_doc.html">
          <span id="child-span">Stop Bubble</span>
        </a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');
      const span = container.querySelector('#child-span')!;

      span.addEventListener('click', (e) => {
        e.stopPropagation();
      }, false);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      span.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: 'target_doc.html' },
        '*'
      );
      postMessageSpy.mockRestore();
    });
  });

  describe('3. In-Page Anchor Behavior (# Fragments)', () => {
    test('VERIFY: # fragments do not trigger obsidian-navigate postMessage and do not prevent default', () => {
      const container = setupDomAndInjectScript(`
        <a id="fragment-exact" href="#">Top of Page</a>
        <a id="fragment-named" href="#section-2">Section 2</a>
        <a id="fragment-heading" href="#heading-title">Heading</a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      ['#fragment-exact', '#fragment-named', '#fragment-heading'].forEach(id => {
        const link = container.querySelector(id)!;
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
      });

      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });
  });

  describe('4. Link Click Interception & Nested Elements', () => {
    test('VERIFY: relative paths, .md, .html, and deep nested element clicks are correctly captured', () => {
      const container = setupDomAndInjectScript(`
        <a id="link-md" href="notes/readme.md">
          <div class="wrapper">
            <p class="paragraph">
              <span id="nested-span">Clickable <strong>Markdown</strong> link</span>
            </p>
          </div>
        </a>
        <a id="link-html" href="../pages/about.html">
          <img id="nested-img" src="icon.png" alt="icon" />
        </a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      // Test deep nested span click inside .md link
      const nestedSpan = container.querySelector('#nested-span')!;
      const event1 = new MouseEvent('click', { bubbles: true, cancelable: true });
      nestedSpan.dispatchEvent(event1);

      expect(event1.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: 'notes/readme.md' },
        '*'
      );

      postMessageSpy.mockClear();

      // Test image click inside .html link
      const nestedImg = container.querySelector('#nested-img')!;
      const event2 = new MouseEvent('click', { bubbles: true, cancelable: true });
      nestedImg.dispatchEvent(event2);

      expect(event2.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: '../pages/about.html' },
        '*'
      );

      postMessageSpy.mockRestore();
    });

    test('VERIFY: external URLs trigger obsidian-open-external', () => {
      const container = setupDomAndInjectScript(`
        <a id="ext-http" href="http://example.com">HTTP Link</a>
        <a id="ext-https" href="https://obsidian.md">HTTPS Link</a>
        <a id="ext-mailto" href="mailto:support@example.com">Mailto Link</a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      const httpLink = container.querySelector('#ext-http')!;
      const event1 = new MouseEvent('click', { bubbles: true, cancelable: true });
      httpLink.dispatchEvent(event1);
      expect(event1.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-open-external', url: 'http://example.com' },
        '*'
      );

      postMessageSpy.mockClear();

      const httpsLink = container.querySelector('#ext-https')!;
      const event2 = new MouseEvent('click', { bubbles: true, cancelable: true });
      httpsLink.dispatchEvent(event2);
      expect(event2.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-open-external', url: 'https://obsidian.md' },
        '*'
      );

      postMessageSpy.mockRestore();
    });

    test('VERIFY: anchors without href or empty href are ignored', () => {
      const container = setupDomAndInjectScript(`
        <a id="no-href">No Href</a>
        <a id="empty-href" href="">Empty Href</a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      ['#no-href', '#empty-href'].forEach(id => {
        const link = container.querySelector(id)!;
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      });

      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });
  });
});
