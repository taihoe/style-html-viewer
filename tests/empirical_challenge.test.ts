import { resolveHtmlAssets } from '../src/engine/HtmlAssetResolver';
import { IPC_SCRIPT_TEMPLATE } from '../src/ipc/IpcBridge';

describe('Empirical Challenge Suite for HtmlAssetResolver & IpcBridge', () => {
  const mockGetResourcePath = (vaultPath: string) => `app://local-vault/${vaultPath}`;

  test('1. Path Traversal & Root Escapes', () => {
    const rawHtml = `<img src="../../outside.png"><img src="../secret.png">`;
    const resRoot = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: '',
      getResourcePathFn: mockGetResourcePath,
    });
    expect(resRoot.assetPaths).toEqual(['outside.png', 'secret.png']);
  });

  test('2. Custom URI Schemes (tel:, sms:, obsidian:)', () => {
    const rawHtml = `<a href="tel:123456">Call</a><img src="tel:123456"><img src="obsidian://open">`;
    const res = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'docs',
      getResourcePathFn: mockGetResourcePath,
    });
    expect(res.assetPaths).not.toContain('docs/tel:123456');
    expect(res.assetPaths).not.toContain('docs/obsidian://open');
    expect(res.assetPaths).toHaveLength(0);
  });

  test('3. Query Parameters and Hash Fragments in Asset URLs', () => {
    const rawHtml = `
      <link rel="stylesheet" href="style.css?v=1.0.0">
      <img src="image.png#section">
      <script src="app.js?build=123&env=prod"></script>
    `;
    const res = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'assets',
      getResourcePathFn: mockGetResourcePath,
    });
    // Check clean asset paths captured (without query params)
    expect(res.assetPaths).toContain('assets/style.css');
    expect(res.transformedHtml).toContain('href="app://local-vault/assets/style.css?v=1.0.0"');
  });

  test('4. DOCTYPE Retention Verification', () => {
    const rawHtml = `<!DOCTYPE html>\n<html><head><title>Test</title></head><body><h1>Hi</h1></body></html>`;
    const res = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: '',
      getResourcePathFn: mockGetResourcePath,
    });
    expect(res.transformedHtml.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  test('5. IPC Script Anchor Navigation Interception for internal # anchors', () => {
    // We simulate browser event handling with JSDOM by running IPC_SCRIPT_TEMPLATE inside window
    document.head.innerHTML = '';
    document.body.innerHTML = '<a id="hash-link" href="#heading1">Heading 1</a><a id="ext-link" href="https://google.com">Google</a>';
    
    // Eval IPC script
    eval(IPC_SCRIPT_TEMPLATE);

    let postedMessage: any = null;
    window.parent.postMessage = (msg: any) => {
      postedMessage = msg;
    };

    const hashLink = document.getElementById('hash-link');
    hashLink?.click();

    // Observe that #heading1 is NOT intercepted (returns early)
    expect(postedMessage).toBeNull();
  });
});
