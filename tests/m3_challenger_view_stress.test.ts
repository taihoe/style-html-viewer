import { HtmlView, VIEW_TYPE_HTML } from '../src/view/HtmlView';

describe('Challenger M3 Empirical Stress & Edge-Case Suite for HtmlView State & Workspace', () => {
  let mockApp: any;
  let eventListeners: Map<string, Function>;

  beforeEach(() => {
    document.body.innerHTML = '';
    eventListeners = new Map();

    mockApp = {
      vault: {
        read: jest.fn().mockImplementation((file: any) => Promise.resolve(`<html><body><h1>${file.path}</h1></body></html>`)),
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        getResourcePath: jest.fn().mockImplementation((f: any) => `app://local-vault/${f.path}`),
        on: jest.fn().mockImplementation((event: string, callback: Function) => {
          eventListeners.set(event, callback);
          return callback;
        }),
        offref: jest.fn().mockImplementation((ref: any) => {
          for (const [evt, cb] of eventListeners.entries()) {
            if (cb === ref) {
              eventListeners.delete(evt);
            }
          }
        })
      },
      workspace: {
        openLinkText: jest.fn()
      }
    };
  });

  const createMockLeafAndFile = (filePath: string) => {
    const contentEl = document.createElement('div');
    const containerEl = document.createElement('div');
    containerEl.appendChild(document.createElement('div'));
    containerEl.appendChild(contentEl);
    document.body.appendChild(containerEl);

    const mockLeaf: any = {
      view: null,
      app: mockApp
    };

    const mockFile: any = {
      path: filePath,
      basename: filePath.split('/').pop()?.replace('.html', '') || 'file',
      extension: 'html',
      parent: { path: filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '' }
    };

    const view = new HtmlView(mockLeaf);
    (view as any).app = mockApp;
    (view as any).contentEl = contentEl;
    (view as any).containerEl = containerEl;

    return { view, mockLeaf, mockFile, contentEl };
  };

  describe('1. Rapid Mode Toggling & Async Race Conditions', () => {
    test('1.1 Rapid synchronous toggling 100 times produces deterministic final DOM state', async () => {
      const { view, mockFile, contentEl } = createMockLeafAndFile('test1.html');
      await view.onOpen();
      await view.onLoadFile(mockFile);

      // Rapidly toggle mode 100 times
      const toggleAction = (view as any).actions.find((a: any) => a.title === 'Toggle source code');
      expect(toggleAction).toBeDefined();

      const togglePromises: Promise<void>[] = [];
      for (let i = 0; i < 100; i++) {
        toggleAction.callback();
      }

      // Allow any pending promises in event queue to resolve
      await new Promise((r) => setTimeout(r, 50));

      // 100 toggles starting from 'preview' (even number) should end in 'preview' mode
      expect((view as any).mode).toBe('preview');
      const iframes = contentEl.querySelectorAll('iframe.html-viewer-iframe');
      const pres = contentEl.querySelectorAll('pre.html-viewer-source-container');
      expect(iframes.length).toBe(1);
      expect(pres.length).toBe(0);
    });

    test('1.2 Asynchronous race condition during slow vault reads during rapid mode toggling', async () => {
      const { view, mockFile, contentEl } = createMockLeafAndFile('slow.html');
      
      let resolveFirstRead: (val: string) => void;
      let resolveSecondRead: (val: string) => void;

      let readCount = 0;
      mockApp.vault.read.mockImplementation(() => {
        readCount++;
        if (readCount === 1) {
          return new Promise((resolve) => { resolveFirstRead = resolve; });
        } else {
          return new Promise((resolve) => { resolveSecondRead = resolve; });
        }
      });

      await view.onOpen();
      
      // Trigger first render in preview mode
      const loadPromise = view.onLoadFile(mockFile);

      // While first read is pending, switch mode to source and trigger second render
      (view as any).mode = 'source';
      const secondRenderPromise = (view as any).renderView();

      // Resolve second read first, then first read
      resolveSecondRead!('<html><body>Source Mode Content</body></html>');
      await secondRenderPromise;

      resolveFirstRead!('<html><body>Preview Mode Content</body></html>');
      await loadPromise;

      // Verification: Render sequence counter prevents stale reads from overwriting DOM
      const pres = contentEl.querySelectorAll('pre.html-viewer-source-container');
      const iframes = contentEl.querySelectorAll('iframe.html-viewer-iframe');
      
      expect(pres.length).toBe(1);
      expect(iframes.length).toBe(0);
    });
  });

  describe('2. Multi-Leaf Workspace Concurrent Interactions', () => {
    test('2.1 Cross-leaf IPC message pollution on postMessage window events', async () => {
      // Create 3 independent views in separate leaves
      const leaf1 = createMockLeafAndFile('leaf1.html');
      const leaf2 = createMockLeafAndFile('leaf2.html');
      const leaf3 = createMockLeafAndFile('leaf3.html');

      await leaf1.view.onOpen();
      await leaf2.view.onOpen();
      await leaf3.view.onOpen();

      await leaf1.view.onLoadFile(leaf1.mockFile);
      await leaf2.view.onLoadFile(leaf2.mockFile);
      await leaf3.view.onLoadFile(leaf3.mockFile);

      // Dispatch window postMessage intended for leaf1
      const iframe1 = leaf1.contentEl.querySelector('iframe.html-viewer-iframe') as HTMLIFrameElement;
      const msgEvent = new MessageEvent('message', {
        data: { type: 'obsidian-navigate', linkText: 'target-note.md' }
      });
      Object.defineProperty(msgEvent, 'source', { value: iframe1.contentWindow });
      window.dispatchEvent(msgEvent);

      // Verification: IPC bridge filters event by contentWindow source matching
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledTimes(1);
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith('target-note.md', 'leaf1.html', false);

      await leaf1.view.onClose();
      await leaf2.view.onClose();
      await leaf3.view.onClose();
    });

    test('2.2 Concurrent multi-leaf lifecycle initialization under 10 parallel views', async () => {
      const leaves = Array.from({ length: 10 }, (_, i) => createMockLeafAndFile(`doc_${i}.html`));
      
      await Promise.all(leaves.map((l) => l.view.onOpen()));
      await Promise.all(leaves.map((l) => l.view.onLoadFile(l.mockFile)));

      for (let i = 0; i < 10; i++) {
        expect(leaves[i].contentEl.querySelector('iframe.html-viewer-iframe')).not.toBeNull();
      }

      await Promise.all(leaves.map((l) => l.view.onClose()));
    });
  });

  describe('3. Heavy HTML Payload Stress Tests', () => {
    test('3.1 Handling 5MB HTML string with 20,000 DOM nodes without crashing', async () => {
      const { view, mockFile, contentEl } = createMockLeafAndFile('heavy.html');
      
      const repeats = 20000;
      const heavyHtml = `<!DOCTYPE html><html><head><title>Heavy</title></head><body>` +
        (`<div>` + `p`.repeat(10) + `</div>`).repeat(repeats) +
        `</body></html>`;

      mockApp.vault.read.mockImplementation(() => Promise.resolve(heavyHtml));

      const startTime = Date.now();
      await view.onOpen();
      await view.onLoadFile(mockFile);
      const duration = Date.now() - startTime;

      const iframe = contentEl.querySelector('iframe.html-viewer-iframe') as HTMLIFrameElement;
      expect(iframe).not.toBeNull();
      expect(iframe.srcdoc.length).toBeGreaterThan(heavyHtml.length);
      expect(duration).toBeLessThan(5000); // Should process under 5s
    });
  });

  describe('4. Lifecycle Teardown & Memory Leak Tests', () => {
    test('4.1 Repeated onOpen calls without onClose cause duplicate action buttons', async () => {
      const { view } = createMockLeafAndFile('actions.html');

      await view.onOpen();
      await view.onOpen();
      await view.onOpen();

      const codeActions = (view as any).actions.filter((a: any) => a.title === 'Toggle source code');
      // Verification: redundant calls to onOpen do not populate duplicate actions
      expect(codeActions.length).toBe(1);
    });

    test('4.2 Unregistering on onClose cleanly removes message listeners and vault watchers', async () => {
      const { view, mockFile } = createMockLeafAndFile('closed.html');

      await view.onOpen();
      await view.onLoadFile(mockFile);

      const addListenerSpy = jest.spyOn(window, 'addEventListener');
      const removeListenerSpy = jest.spyOn(window, 'removeEventListener');

      await view.onClose();

      expect(removeListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));

      // Trigger a vault modify event and ensure renderView is not called after close
      const renderSpy = jest.spyOn(view as any, 'renderView');
      const modifyCb = eventListeners.get('modify');
      if (modifyCb) {
        modifyCb({ path: 'closed.html' });
      }

      expect(renderSpy).not.toHaveBeenCalled();
    });
  });
});
