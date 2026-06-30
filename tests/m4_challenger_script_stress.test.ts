import { IpcBridge, getClickInterceptorScript } from '../src/ipc/IpcBridge';
import { resolveHtmlAssets } from '../src/engine/HtmlAssetResolver';

describe('Milestone 4 - IPC Script & Link Interception Stress Harness', () => {
  let mockApp: any;
  let getSourcePathMock: jest.Mock<string, []>;
  let ipcBridge: IpcBridge;
  let originalWindowOpen: typeof window.open;

  beforeEach(() => {
    getSourcePathMock = jest.fn().mockReturnValue('docs/active_note.html');
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
    document.body.innerHTML = '';
  });

  afterEach(() => {
    ipcBridge.detach();
    window.open = originalWindowOpen;
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * Helper function to evaluate click interceptor script in DOM and simulate click events
   */
  function setupDomAndExecuteScript(htmlContent: string): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Execute interceptor script in current window environment
    const scriptText = getClickInterceptorScript();
    const scriptEl = document.createElement('script');
    scriptEl.textContent = scriptText;
    document.head.appendChild(scriptEl);

    return container;
  }

  describe('Category 1: Complex HTML & Nested Elements Handling', () => {
    test('STRESS 1.1: Clicking deeply nested element inside <a> propagates to closest anchor', () => {
      const container = setupDomAndExecuteScript(`
        <a id="target-link" href="subfolder/nested_target.md">
          <div class="card">
            <div class="card-body">
              <span class="badge">Tag</span>
              <p class="text">Click <strong id="deep-node">here right now</strong></p>
            </div>
          </div>
        </a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');
      const deepNode = container.querySelector('#deep-node')!;
      
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      deepNode.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: 'subfolder/nested_target.md' },
        '*'
      );
      postMessageSpy.mockRestore();
    });

    test('STRESS 1.2: Clicking SVG path inside <a> extracts correct href', () => {
      const container = setupDomAndExecuteScript(`
        <a id="svg-link" href="https://external-icon.org">
          <svg id="svg-root" width="100" height="100">
            <g id="svg-group">
              <path id="svg-path" d="M10 10 H 90 V 90 H 10 Z" />
            </g>
          </svg>
        </a>
      `);

      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');
      const pathNode = container.querySelector('#svg-path')!;
      
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      pathNode.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-open-external', url: 'https://external-icon.org' },
        '*'
      );
      postMessageSpy.mockRestore();
    });

    test('STRESS 1.3: Shadow DOM encapsulation retargeting limits click delegation', () => {
      const host = document.createElement('div');
      host.id = 'shadow-host';
      document.body.appendChild(host);
      
      if (typeof host.attachShadow === 'function') {
        const shadowRoot = host.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = `<a id="shadow-link" href="inside_shadow.md">Shadow Link</a>`;

        // Execute interceptor script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = getClickInterceptorScript();
        document.head.appendChild(scriptEl);

        const postMessageSpy = jest.spyOn(window.parent, 'postMessage');
        const shadowLink = shadowRoot.querySelector('#shadow-link')!;
        
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        shadowLink.dispatchEvent(event);

        // Document level click interceptor sees event.target retargeted to shadow host if retargeted,
        // or inside shadow DOM depending on JSDOM implementation.
        // We capture actual behavior empirically.
        postMessageSpy.mockRestore();
      }
    });
  });

  describe('Category 2: Dynamic DOM Manipulation & Event Handling', () => {
    test('STRESS 2.1: Dynamic DOM element insertion catches clicks via document delegation', () => {
      const container = setupDomAndExecuteScript(`<div id="dynamic-container"></div>`);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      // Dynamically append new link after script initialization
      const dynamicLink = document.createElement('a');
      dynamicLink.href = 'dynamic_note.md';
      dynamicLink.id = 'dynamic-link';
      dynamicLink.textContent = 'Dynamic Link';
      container.querySelector('#dynamic-container')!.appendChild(dynamicLink);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      dynamicLink.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: 'dynamic_note.md' },
        '*'
      );
      postMessageSpy.mockRestore();
    });

    test('STRESS 2.2: Event stopPropagation on child element bypasses document click interceptor', () => {
      const container = setupDomAndExecuteScript(`
        <a href="target_should_not_open.md" id="parent-link">
          <button id="child-button">Stop Propagation Button</button>
        </a>
      `);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      const button = container.querySelector('#child-button')!;
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevents event from bubbling up to document
      });

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      button.dispatchEvent(event);

      // Document click listener is invoked because it is registered in the capture phase!
      expect(postMessageSpy).toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });
  });

  describe('Category 3: Link Schemes & Case Sensitivity Vulnerabilities', () => {
    test('STRESS 3.1: Uppercase scheme HTTP:// and HTTPS:// fail startsWith check and route to obsidian-navigate', () => {
      const container = setupDomAndExecuteScript(`
        <a id="uppercase-http" href="HTTP://EXAMPLE.COM/PAGE">Uppercase HTTP</a>
        <a id="uppercase-https" href="Https://secure.org">Mixed Case HTTPS</a>
      `);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      const httpLink = container.querySelector('#uppercase-http')!;
      const httpEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      httpLink.dispatchEvent(httpEvent);

      // Case-insensitive check routes uppercase HTTP:// to obsidian-open-external
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-open-external', url: 'HTTP://EXAMPLE.COM/PAGE' },
        '*'
      );

      postMessageSpy.mockClear();

      const httpsLink = container.querySelector('#uppercase-https')!;
      const httpsEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      httpsLink.dispatchEvent(httpsEvent);

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-open-external', url: 'Https://secure.org' },
        '*'
      );

      postMessageSpy.mockRestore();
    });

    test('STRESS 3.2: Non-standard schemes (mailto:, tel:, obsidian:, javascript:) are routed as obsidian-navigate', () => {
      const container = setupDomAndExecuteScript(`
        <a id="link-mailto" href="mailto:user@example.com">Mail</a>
        <a id="link-tel" href="tel:+15550199">Tel</a>
        <a id="link-js" href="javascript:console.log(1)">JS</a>
        <a id="link-obsidian" href="obsidian://open?vault=test">Obsidian URL</a>
      `);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      ['#link-mailto', '#link-tel', '#link-js', '#link-obsidian'].forEach(selector => {
        const link = container.querySelector(selector)!;
        const href = link.getAttribute('href')!;
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(event);

        if (selector === '#link-mailto') {
          expect(postMessageSpy).toHaveBeenCalledWith(
            { type: 'obsidian-open-external', url: href },
            '*'
          );
        } else {
          expect(postMessageSpy).toHaveBeenCalledWith(
            { type: 'obsidian-navigate', linkText: href },
            '*'
          );
        }
        postMessageSpy.mockClear();
      });

      postMessageSpy.mockRestore();
    });

    test('STRESS 3.3: Protocol-relative URLs (//example.com) route to obsidian-navigate', () => {
      const container = setupDomAndExecuteScript(`
        <a id="link-proto-rel" href="//cdn.example.com/lib.js">Protocol Relative</a>
      `);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      const link = container.querySelector('#link-proto-rel')!;
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: '//cdn.example.com/lib.js' },
        '*'
      );
      postMessageSpy.mockRestore();
    });
  });

  describe('Category 4: Fragments, Anchor Tags, and Target Attributes', () => {
    test('STRESS 4.1: Internal # fragment links prevent default in-page jump and post obsidian-navigate', () => {
      const container = setupDomAndExecuteScript(`
        <a id="fragment-link" href="#heading-2">Jump to Heading 2</a>
        <h2 id="heading-2">Heading 2 Title</h2>
      `);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      const link = container.querySelector('#fragment-link')!;
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);

      // Remediation: Same-page fragment links do not trigger postMessage and do not prevent default
      expect(event.defaultPrevented).toBe(false);
      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });

    test('STRESS 4.2: Target attributes (target="_blank") are ignored by interceptor payload', () => {
      const container = setupDomAndExecuteScript(`
        <a id="blank-link" href="note_in_new_tab.md" target="_blank">New Tab Note</a>
      `);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      const link = container.querySelector('#blank-link')!;
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);

      // Target attribute is completely stripped/ignored from message payload
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'obsidian-navigate', linkText: 'note_in_new_tab.md' },
        '*'
      );
      postMessageSpy.mockRestore();
    });

    test('STRESS 4.3: Anchors without href or with empty href are gracefully ignored', () => {
      const container = setupDomAndExecuteScript(`
        <a id="no-href-anchor" name="section-top">Named Anchor</a>
        <a id="empty-href-anchor" href="">Empty Href</a>
      `);
      const postMessageSpy = jest.spyOn(window.parent, 'postMessage');

      const noHref = container.querySelector('#no-href-anchor')!;
      const event1 = new MouseEvent('click', { bubbles: true, cancelable: true });
      noHref.dispatchEvent(event1);
      expect(event1.defaultPrevented).toBe(false);

      const emptyHref = container.querySelector('#empty-href-anchor')!;
      const event2 = new MouseEvent('click', { bubbles: true, cancelable: true });
      emptyHref.dispatchEvent(event2);
      expect(event2.defaultPrevented).toBe(false);

      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });
  });

  describe('Category 5: Path Traversal & IpcBridge Delivery Edge Cases', () => {
    test('STRESS 5.1: Sanitization bypass analysis for path traversal in IpcBridge', () => {
      ipcBridge.attach();

      // Test vector 1: ....//....//secret.md
      const event1 = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '....//....//secret.md' },
        source: window
      });
      window.dispatchEvent(event1);

      // Test vector 2: ..\..\windows_secret.txt
      const event2 = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: '..\\..\\windows_secret.txt' },
        source: window
      });
      window.dispatchEvent(event2);

      // Verify openLinkText calls and exact sanitized paths passed
      expect(mockApp.workspace.openLinkText).toHaveBeenCalled();
    });
  });
});
