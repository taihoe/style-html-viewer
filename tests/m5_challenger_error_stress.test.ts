import { HtmlView, VIEW_TYPE_HTML } from '../src/view/HtmlView';

describe('Milestone 5 Error Handling & Error Card Stress Tests', () => {
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
      path: 'docs/stress_test.html',
      basename: 'stress_test',
      extension: 'html',
      parent: { path: 'docs' }
    };

    mockApp = {
      vault: {
        read: jest.fn(),
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

  describe('1. Empty files, whitespace-only, and giant empty strings', () => {
    test('0-byte empty string ("")', async () => {
      mockApp.vault.read.mockResolvedValue('');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      const errorMessage = container.querySelector('.html-viewer-error-message');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toBe('HTML file is empty');
    });

    test('whitespace-only string with tabs and newlines', async () => {
      mockApp.vault.read.mockResolvedValue('   \n\t\r   \n   ');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      const errorMessage = container.querySelector('.html-viewer-error-message');
      expect(errorMessage.textContent).toBe('HTML file is empty');
    });

    test('giant empty string (1MB of spaces)', async () => {
      const giantSpaces = ' '.repeat(1024 * 1024);
      mockApp.vault.read.mockResolvedValue(giantSpaces);
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      const errorMessage = container.querySelector('.html-viewer-error-message');
      expect(errorMessage.textContent).toBe('HTML file is empty');
    });
  });

  describe('2. Malformed XML/HTML markup causing <parsererror> tags', () => {
    test('explicit parsererror tag in content', async () => {
      mockApp.vault.read.mockResolvedValue('<div><parsererror>XML Parsing Error: unclosed tag</parsererror></div>');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      const errorMessage = container.querySelector('.html-viewer-error-message');
      expect(errorMessage.textContent).toBe('Malformed or invalid HTML structure');
    });

    test('parsererror with attributes and complex body', async () => {
      mockApp.vault.read.mockResolvedValue('<html><body><parsererror style="color:red">Syntax error</parsererror></body></html>');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      const errorMessage = container.querySelector('.html-viewer-error-message');
      expect(errorMessage.textContent).toBe('Malformed or invalid HTML structure');
    });
  });

  describe('3. HTML files containing null bytes or invalid character encodings', () => {
    test('file containing only null bytes', async () => {
      mockApp.vault.read.mockResolvedValue('\0\0\0\0');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      // Note: trim() on '\0\0\0\0' doesn't trim null bytes in JS string trim (only whitespace),
      // so it passes empty check unless parser or handling treats it or allows it to render.
    });

    test('file containing null bytes inside HTML content', async () => {
      mockApp.vault.read.mockResolvedValue('<html><body>Hello\0World</body></html>');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      // Should either render or error cleanly without throwing uncaught exceptions
      expect(container.children.length).toBeGreaterThan(0);
    });

    test('file with unicode replacement characters (invalid encoding artifacts)', async () => {
      mockApp.vault.read.mockResolvedValue('<html><body>\uFFFD\uFFFD Invalid Encoding \uFFFD</body></html>');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      expect(container.children.length).toBeGreaterThan(0);
    });
  });

  describe('4. Vault read rejection edge cases (non-standard throw values)', () => {
    test('vault.read rejects with string', async () => {
      mockApp.vault.read.mockRejectedValue('String error message');
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();
      const errorMessage = container.querySelector('.html-viewer-error-message');
      expect(errorMessage.textContent).toBe('String error message');
    });

    test('vault.read rejects with null or undefined', async () => {
      mockApp.vault.read.mockRejectedValue(null);
      
      // We test if onLoadFile catches null gracefully or throws TypeError on err.message
      try {
        await htmlView.onLoadFile(mockFile);
        const container = (htmlView as any).contentEl;
        const errorContainer = container.querySelector('.html-viewer-error-container');
        expect(errorContainer).not.toBeNull();
      } catch (e: any) {
        // If it threw, record the uncaught exception
        expect(e).toBeUndefined(); // Will fail if uncaught exception was thrown
      }
    });
  });

  describe('5. Error Card UI Component Structure and Clean State Reset', () => {
    test('verifies all error card CSS classes and elements on error', async () => {
      mockApp.vault.read.mockRejectedValue(new Error('IO Error'));
      await htmlView.onLoadFile(mockFile);

      const container = (htmlView as any).contentEl;
      expect(container.classList.contains('html-viewer-container')).toBe(true);

      const errorContainer = container.querySelector('.html-viewer-error-container');
      expect(errorContainer).not.toBeNull();

      const card = errorContainer.querySelector('.html-viewer-error-card');
      expect(card).not.toBeNull();

      const header = card.querySelector('.html-viewer-error-header');
      expect(header).not.toBeNull();

      const title = header.querySelector('.html-viewer-error-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toBe('Error Loading HTML File');

      const msg = card.querySelector('.html-viewer-error-message');
      expect(msg).not.toBeNull();
      expect(msg.textContent).toBe('IO Error');
    });
  });
});
