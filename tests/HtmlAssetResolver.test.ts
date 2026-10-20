import { resolveHtmlAssets, ResolveHtmlAssetsOptions } from '../src/engine/HtmlAssetResolver';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const resolve = (rawHtml: string, extra: Partial<ResolveHtmlAssetsOptions> = {}) => resolveHtmlAssets({
  rawHtml, currentFileFolderPath: 'docs', getResourcePathFn: path => `data:image/svg+xml;base64,${btoa(path)}`,
  bridgeToken: 'test-token', ...extra
});

describe('HtmlAssetResolver Unit Tests', () => {
  test('resolves local CSS, classic scripts and images with clean dependencies', async () => {
    const result = await resolve('<link rel="stylesheet" href="css/main.css"><script src="../app.js"></script><img src="images/banner.png">', {
      allowScripts: true, readVaultFileFn: async () => 'body { color: red; }'
    });
    const doc = parse(result.transformedHtml);
    expect(doc.querySelector('style')?.textContent).toContain('color: red');
    expect(doc.querySelector('script[src]')?.getAttribute('src')).toMatch(/^data:/);
    expect(result.assetPaths).toEqual(expect.arrayContaining(['docs/css/main.css', 'app.js', 'docs/images/banner.png']));
  });

  test('resolves image, video poster, audio, picture, subtitle and SVG resources', async () => {
    const result = await resolve('<video src="intro.mp4" poster="poster.jpg"><track src="en.vtt"></video><audio src="sound.mp3"></audio><source srcset="big.png 2x, small.png 1x"><svg><image href="logo.svg"/></svg>');
    expect(result.assetPaths).toEqual(expect.arrayContaining(['docs/intro.mp4', 'docs/poster.jpg', 'docs/en.vtt', 'docs/sound.mp3', 'docs/big.png', 'docs/small.png', 'docs/logo.svg']));
  });

  test('separates suffixes before decoding and preserves SVG fragments', async () => {
    const resource = jest.fn(async () => 'data:image/svg+xml;base64,PHN2Zy8+');
    const result = await resolve('<img src="my%20image.svg?v=2#icon">', { getResourcePathFn: resource });
    expect(resource).toHaveBeenCalledWith('docs/my image.svg');
    expect(parse(result.transformedHtml).querySelector('img')?.getAttribute('src')).toBe('data:image/svg+xml;base64,PHN2Zy8+#icon');
  });

  test('preserves DOCTYPE and creates a heading outline without changing original ids', async () => {
    const result = await resolve('<!DOCTYPE html><h1 id="original">Title</h1><h2>Section</h2>');
    expect(result.transformedHtml.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(result.headings.map(h => [h.text, h.level])).toEqual([['Title', 1], ['Section', 2]]);
    expect(parse(result.transformedHtml).querySelector('h1')?.id).toBe('original');
  });

  test.each(['Content-Security-Policy', 'content-security-policy', ' CONTENT-SECURITY-POLICY '])('replaces %s with a policy before all scripts', async httpEquiv => {
    const result = await resolve(`<script>alert(1)</script><meta http-equiv="${httpEquiv}" content="default-src *; connect-src *"><meta http-equiv="Content-Security-Policy" content="script-src https:">`);
    const doc = parse(result.transformedHtml);
    expect(doc.querySelectorAll('meta[http-equiv]')).toHaveLength(1);
    const policy = doc.head.firstElementChild?.getAttribute('content');
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).not.toMatch(/https:|unsafe-eval|file:|app:|\*/);
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(doc.querySelector('script')?.getAttribute('nonce')).toBe('test-token');
  });

  test('document script controls remove handlers and javascript URLs in default mode', async () => {
    const result = await resolve('<body onload="alert(1)"><script src="app.js"></script><a href="javascript:alert(1)">test</a><img onerror="alert(1)"></body>');
    const doc = parse(result.transformedHtml);
    expect(doc.querySelector('[onload],[onerror],script[src]')).toBeNull();
    expect(doc.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ kind: 'blocked', path: 'app.js' }));
  });

  test('opt-in scripts remain local and never receive eval or parent access permissions', async () => {
    const result = await resolve('<script>window.local=true</script><script src="https://example.invalid/a.js"></script>', { allowScripts: true });
    const doc = parse(result.transformedHtml);
    expect(doc.querySelectorAll('script')).toHaveLength(2);
    expect(doc.querySelector('meta')?.content).not.toContain('unsafe-eval');
    expect(doc.querySelector('script[src]')).toBeNull();
  });

  test('strips refresh, base, preconnect and nested active documents', async () => {
    const result = await resolve('<base href="https://evil.invalid"><meta http-equiv="refresh" content="0;url=https://evil.invalid"><link rel="preconnect" href="https://evil.invalid"><iframe srcdoc="hello"></iframe><object data="a.html"></object>');
    expect(parse(result.transformedHtml).querySelector('base,iframe,object,link,meta[http-equiv="refresh"]')).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  test('inlines nested imports with media, layer and supports; tracks CSS assets', async () => {
    const files: Record<string, string> = {
      'docs/css/main.css': '@import "parts/theme.css" layer(theme) supports(display: grid) screen; body{background:url("../my image.svg?v=1#icon")}',
      'docs/css/parts/theme.css': '@font-face{src:url("../../../fonts/test.woff2")} '
    };
    const read = jest.fn(async (path: string) => { if (!(path in files)) throw new Error(path); return files[path]; });
    const result = await resolve('<link rel="stylesheet" media="print" title="print theme" href="css/main.css">', { readVaultFileFn: read });
    const style = parse(result.transformedHtml).querySelector('style')!;
    expect(style.media).toBe('print');
    expect(style.title).toBe('print theme');
    expect(style.textContent).toMatch(/@layer theme[\s\S]*@supports \(display: grid\)[\s\S]*@media screen/);
    expect(result.assetPaths).toEqual(expect.arrayContaining(['docs/css/main.css', 'docs/css/parts/theme.css', 'fonts/test.woff2', 'docs/my image.svg']));
  });

  test('cyclic imports stop with a diagnostic instead of recursive loading', async () => {
    const result = await resolve('<link rel="stylesheet" href="a.css">', { readVaultFileFn: async () => '@import "a.css"; body{color:red}' });
    expect(result.diagnostics.some(d => d.message.includes('Cyclic'))).toBe(true);
  });

  test('alternate and disabled sheets remain inactive', async () => {
    const result = await resolve('<link rel="alternate stylesheet" href="a.css"><link rel="stylesheet" disabled href="b.css">', { readVaultFileFn: async () => 'p{color:red}' });
    expect([...parse(result.transformedHtml).querySelectorAll('style')].every(s => s.media === 'not all')).toBe(true);
  });

  test('failed stylesheet reads are diagnosed and retained as dependencies for creation recovery', async () => {
    const result = await resolve('<link rel="stylesheet" href="missing.css">', { readVaultFileFn: async () => { throw new Error('Missing CSS'); } });
    expect(result.assetPaths).toContain('docs/missing.css');
    expect(result.diagnostics[0]).toMatchObject({ kind: 'missing', path: 'missing.css' });
  });

  test('resolves inline CSS URLs and safely serializes CSS text containing closing style tags', async () => {
    const result = await resolve('<link rel="stylesheet" href="style.css"><div style="background:url(img.png)"></div>', { readVaultFileFn: async () => 'p::after{content:"</style><script>alert(1)</script>"}' });
    const doc = parse(result.transformedHtml);
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(doc.querySelector('div')?.getAttribute('style')).toContain('data:image');
  });

  test('deduplicates reads and tracks a missing asset for later reload', async () => {
    const resource = jest.fn(async () => { throw new Error('Missing'); });
    const result = await resolve('<img src="a.png"><img src="a.png">', { getResourcePathFn: resource });
    expect(resource).toHaveBeenCalledTimes(1);
    expect(result.assetPaths).toEqual(['docs/a.png']);
    expect(result.diagnostics).toHaveLength(1);
  });
});
