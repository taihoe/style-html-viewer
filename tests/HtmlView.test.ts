import { HtmlView, VIEW_TYPE_HTML } from '../src/view/HtmlView';

describe('HtmlView Component & Milestone 3 Integration', () => {
  let mockApp: any;
  let mockLeaf: any;
  let mockFile: any;
  let htmlView: HtmlView;

  beforeEach(() => {
    document.body.innerHTML = '';
    const contentEl = document.createElement('div');
    const containerEl = document.createElement('div');
    containerEl.appendChild(document.createElement('div')); // children[0]
    containerEl.appendChild(contentEl); // children[1]

    mockLeaf = {
      view: null,
      app: null
    };

    mockFile = {
      path: 'docs/test.html',
      basename: 'test',
      extension: 'html',
      parent: { path: 'docs' }
    };

    mockApp = {
      vault: {
        read: jest.fn().mockResolvedValue('<html><body><h1>Hello World</h1></body></html>'),
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

  test('should exported VIEW_TYPE_HTML be html-viewer-view', () => {
    expect(VIEW_TYPE_HTML).toBe('html-viewer-view');
    expect(htmlView.getViewType()).toBe('html-viewer-view');
  });

  test('should register action buttons on open', async () => {
    const addActionSpy = jest.spyOn(htmlView, 'addAction');
    await htmlView.onOpen();

    expect(addActionSpy).toHaveBeenCalledWith('code', 'Toggle source code', expect.any(Function));
    expect(addActionSpy).toHaveBeenCalledWith('refresh-cw', 'Reload', expect.any(Function));
  });

  test('should render preview iframe with explicit sandbox attributes in preview mode', async () => {
    await htmlView.onLoadFile(mockFile);

    const container = (htmlView as any).contentEl;
    const iframe = container.querySelector('iframe.html-viewer-iframe');
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin allow-modals');
  });

  test('should switch to source mode rendering raw HTML in pre.html-viewer-source-container', async () => {
    await htmlView.onOpen();
    await htmlView.onLoadFile(mockFile);

    // Simulate clicking the source toggle action button
    const actions = (htmlView as any).actions || [];
    // Or call renderView after toggling mode manually
    (htmlView as any).mode = 'source';
    await (htmlView as any).renderView();

    const container = (htmlView as any).contentEl;
    const sourcePre = container.querySelector('pre.html-viewer-source-container');
    expect(sourcePre).not.toBeNull();
    expect(sourcePre.textContent).toBe('<html><body><h1>Hello World</h1></body></html>');
  });

  test('should call ipcBridge.detach and vaultWatcher.unregister on onClose', async () => {
    const detachSpy = jest.spyOn((htmlView as any).ipcBridge, 'detach');
    const unregisterSpy = jest.spyOn((htmlView as any).vaultWatcher, 'unregister');

    await htmlView.onClose();

    expect(detachSpy).toHaveBeenCalled();
    expect(unregisterSpy).toHaveBeenCalled();
  });

  test('should render error container when app.vault.read throws an exception', async () => {
    mockApp.vault.read.mockRejectedValue(new Error('Failed to read file from vault'));

    await htmlView.onLoadFile(mockFile);

    const container = (htmlView as any).contentEl;
    const errorContainer = container.querySelector('.html-viewer-error-container');
    expect(errorContainer).not.toBeNull();
    const errorMessage = container.querySelector('.html-viewer-error-message');
    expect(errorMessage).not.toBeNull();
    expect(errorMessage.textContent).toBe('Failed to read file from vault');
  });

  test('should render styled error card when file content is empty', async () => {
    mockApp.vault.read.mockResolvedValue('   ');

    await htmlView.onLoadFile(mockFile);

    const container = (htmlView as any).contentEl;
    const errorContainer = container.querySelector('.html-viewer-error-container');
    expect(errorContainer).not.toBeNull();
    const errorMessage = container.querySelector('.html-viewer-error-message');
    expect(errorMessage).not.toBeNull();
    expect(errorMessage.textContent).toBe('HTML file is empty');
  });

  test('should render styled error card when HTML is malformed with parsererror', async () => {
    mockApp.vault.read.mockResolvedValue('<parsererror>Syntax error in HTML</parsererror>');

    await htmlView.onLoadFile(mockFile);

    const container = (htmlView as any).contentEl;
    const errorContainer = container.querySelector('.html-viewer-error-container');
    expect(errorContainer).not.toBeNull();
    const errorMessage = container.querySelector('.html-viewer-error-message');
    expect(errorMessage).not.toBeNull();
    expect(errorMessage.textContent).toBe('Malformed or invalid HTML structure');
  });
});

