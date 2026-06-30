import { resolveHtmlAssets } from '../src/engine/HtmlAssetResolver';

describe('HtmlAssetResolver Unit Tests', () => {
  const mockGetResourcePath = (vaultPath: string) => `app://local-vault/${vaultPath}`;

  test('should resolve relative stylesheet, script, and image paths relative to current folder', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="stylesheet" href="./styles/main.css">
          <script src="../scripts/app.js"></script>
        </head>
        <body>
          <img src="images/banner.png" alt="Banner">
        </body>
      </html>
    `;

    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'docs/learning',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('href="app://local-vault/docs/learning/styles/main.css"');
    expect(result.transformedHtml).toContain('src="app://local-vault/docs/scripts/app.js"');
    expect(result.transformedHtml).toContain('src="app://local-vault/docs/learning/images/banner.png"');
    
    expect(result.assetPaths).toEqual(expect.arrayContaining([
      'docs/learning/styles/main.css',
      'docs/scripts/app.js',
      'docs/learning/images/banner.png'
    ]));
  });

  test('should resolve all asset tag types (<link>, <img>, <script>, <video>, <audio>, <source>, <iframe>) and attributes (src, srcset, poster, href)', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="icon" href="assets/favicon.ico">
          <link rel="preload" href="fonts/custom.woff2" as="font">
        </head>
        <body>
          <video src="media/intro.mp4" poster="media/poster.jpg"></video>
          <audio src="media/podcast.mp3"></audio>
          <picture>
            <source srcset="images/pic-large.png 2x, images/pic-small.png 1x">
            <img src="images/pic-fallback.png" srcset="images/pic-2x.png 2x">
          </picture>
          <iframe src="embed/demo.html"></iframe>
        </body>
      </html>
    `;

    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'lessons',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('href="app://local-vault/lessons/assets/favicon.ico"');
    expect(result.transformedHtml).toContain('href="app://local-vault/lessons/fonts/custom.woff2"');
    expect(result.transformedHtml).toContain('src="app://local-vault/lessons/media/intro.mp4"');
    expect(result.transformedHtml).toContain('poster="app://local-vault/lessons/media/poster.jpg"');
    expect(result.transformedHtml).toContain('src="app://local-vault/lessons/media/podcast.mp3"');
    expect(result.transformedHtml).toContain('srcset="app://local-vault/lessons/images/pic-large.png 2x, app://local-vault/lessons/images/pic-small.png 1x"');
    expect(result.transformedHtml).toContain('src="app://local-vault/lessons/images/pic-fallback.png"');
    expect(result.transformedHtml).toContain('srcset="app://local-vault/lessons/images/pic-2x.png 2x"');
    expect(result.transformedHtml).toContain('src="app://local-vault/lessons/embed/demo.html"');

    expect(result.assetPaths).toEqual(expect.arrayContaining([
      'lessons/assets/favicon.ico',
      'lessons/fonts/custom.woff2',
      'lessons/media/intro.mp4',
      'lessons/media/poster.jpg',
      'lessons/media/podcast.mp3',
      'lessons/images/pic-large.png',
      'lessons/images/pic-small.png',
      'lessons/images/pic-fallback.png',
      'lessons/images/pic-2x.png',
      'lessons/embed/demo.html'
    ]));
  });

  test('should preserve query strings and hash fragments while cleaning vault asset paths', () => {
    const rawHtml = `
      <link rel="stylesheet" href="css/style.css?v=1.2.3#theme">
      <img src="img/photo.jpg?size=large#top" srcset="img/photo-2x.jpg?size=large#top 2x">
    `;

    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'notes',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('href="app://local-vault/notes/css/style.css?v=1.2.3#theme"');
    expect(result.transformedHtml).toContain('src="app://local-vault/notes/img/photo.jpg?size=large#top"');
    expect(result.transformedHtml).toContain('srcset="app://local-vault/notes/img/photo-2x.jpg?size=large#top 2x"');

    // assetPaths should contain clean vault file paths without query string or hash
    expect(result.assetPaths).toEqual(expect.arrayContaining([
      'notes/css/style.css',
      'notes/img/photo.jpg',
      'notes/img/photo-2x.jpg'
    ]));
  });

  test('should preserve <!DOCTYPE html> declaration at start of transformed HTML', () => {
    const rawHtml = `<!DOCTYPE html>\n<html><head><title>Test</title></head><body><h1>Hello</h1></body></html>`;
    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: '',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml.startsWith('<!DOCTYPE html>\n')).toBe(true);
  });

  test('should inject Content Security Policy meta tag into head with local schemes', () => {
    const rawHtml = `<html><head><title>Test</title></head><body></body></html>`;
    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: '',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(result.transformedHtml).toContain("default-src 'self' 'unsafe-inline' 'unsafe-eval' app: app://* file: data: blob:");
    expect(result.transformedHtml).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' app: app://* file: data: blob:");
    expect(result.transformedHtml).toContain("style-src 'self' 'unsafe-inline' app: app://* file: data: blob:");
  });

  test('should parse and update pre-existing Content Security Policy meta tag', () => {
    const rawHtml = `<html><head><meta http-equiv="Content-Security-Policy" content="style-src 'unsafe-inline' 'self' https://fonts.googleapis.com;"></head><body></body></html>`;
    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: '',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(result.transformedHtml).toContain("style-src 'unsafe-inline' 'self' https://fonts.googleapis.com app: app://* file: data: blob:");
    expect(result.transformedHtml).toContain("default-src 'self' app: app://* file: data: blob:");
  });

  test('should inject IPC link interception script into head', () => {
    const rawHtml = `<html><head></head><body></body></html>`;
    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: '',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('obsidian-navigate');
    expect(result.transformedHtml).toContain('obsidian-open-external');
  });

  test('should not modify external or special URI schemes (http, https, tel, sms, mailto, javascript, data, blob)', () => {
    const rawHtml = `
      <html>
        <head>
          <link rel="stylesheet" href="https://cdn.example.com/style.css">
          <script src="http://example.com/analytics.js"></script>
        </head>
        <body>
          <a href="tel:+1234567890">Call Us</a>
          <a href="sms:+1234567890">Text Us</a>
          <a href="mailto:support@example.com">Email Us</a>
          <a href="javascript:void(0)">Action</a>
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">
          <video src="blob:http://localhost/uuid"></video>
        </body>
      </html>
    `;

    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'notes',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('href="https://cdn.example.com/style.css"');
    expect(result.transformedHtml).toContain('src="http://example.com/analytics.js"');
    expect(result.transformedHtml).toContain('href="tel:+1234567890"');
    expect(result.transformedHtml).toContain('href="sms:+1234567890"');
    expect(result.transformedHtml).toContain('href="mailto:support@example.com"');
    expect(result.transformedHtml).toContain('href="javascript:void(0)"');
    expect(result.transformedHtml).toContain('src="data:image/png;base64');
    expect(result.transformedHtml).toContain('src="blob:http://localhost/uuid"');

    expect(result.assetPaths).toHaveLength(0);
  });

  test('should deduplicate assetPaths in result', () => {
    const rawHtml = `
      <div>
        <img src="images/logo.png" alt="Logo 1">
        <img src="images/logo.png" alt="Logo 2">
        <script src="js/app.js"></script>
        <script src="js/app.js"></script>
      </div>
    `;

    const result = resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'project',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.assetPaths).toHaveLength(2);
    expect(result.assetPaths).toEqual(expect.arrayContaining([
      'project/images/logo.png',
      'project/js/app.js'
    ]));
  });
});
