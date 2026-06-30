import { resolveHtmlAssets } from '../src/engine/HtmlAssetResolver';

describe('Challenger 4 Stress Testing: URL Parsing, Query Params, Hash Fragments & Asset Paths', () => {
  const mockGetResourcePath = (vaultPath: string) => `app://local-vault/${vaultPath}`;

  test('Preservation of query params and hash fragments vs clean assetPaths', async () => {
    const rawHtml = `
      <link rel="stylesheet" href="css/style.css?v=1.2.3&theme=dark#header">
      <img src="img/photo.jpg#section-2?param=val">
      <script src="js/app.js?build=99&lang=en"></script>
    `;
    const result = await resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'folder',
      getResourcePathFn: mockGetResourcePath,
    });

    expect(result.transformedHtml).toContain('href="app://local-vault/folder/css/style.css?v=1.2.3&amp;theme=dark#header"');
    expect(result.transformedHtml).toContain('src="app://local-vault/folder/img/photo.jpg#section-2?param=val"');
    expect(result.transformedHtml).toContain('src="app://local-vault/folder/js/app.js?build=99&amp;lang=en"');

    expect(result.assetPaths).toEqual(expect.arrayContaining([
      'folder/css/style.css',
      'folder/img/photo.jpg',
      'folder/js/app.js'
    ]));
  });

  test('Empirical finding: Percent-encoded characters in URL paths retained in assetPaths', async () => {
    const rawHtml = `<img src="my%20folder/my%20image.png?v=1#pic">`;
    const result = await resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'docs',
      getResourcePathFn: mockGetResourcePath,
    });

    // Empirically demonstrates percent-encoded string is retained in assetPaths
    expect(result.assetPaths).toEqual(['docs/my%20folder/my%20image.png']);
    expect(result.transformedHtml).toContain('src="app://local-vault/docs/my%20folder/my%20image.png?v=1#pic"');
  });

  test('Empirical finding: Leading and trailing whitespace in URL attributes corrupts assetPaths', async () => {
    const rawHtml = `<link rel="stylesheet" href="  styles/main.css?v=1#top  "><img src="  images/banner.png  ">`;
    const result = await resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'notes',
      getResourcePathFn: mockGetResourcePath,
    });

    // Empirically demonstrates leading/trailing spaces are preserved into assetPaths
    expect(result.assetPaths).toEqual(['notes/  styles/main.css', 'notes/  images/banner.png  ']);
    expect(result.transformedHtml).toContain('href="app://local-vault/notes/  styles/main.css?v=1#top  "');
  });

  test('Empirical finding: Comma inside query parameter breaks srcset splitting', async () => {
    const rawHtml = `<img src="fallback.jpg" srcset="image.jpg?rect=0,0,100,100 1x, image-2x.jpg?rect=0,0,200,200 2x">`;
    const result = await resolveHtmlAssets({
      rawHtml,
      currentFileFolderPath: 'gallery',
      getResourcePathFn: mockGetResourcePath,
    });

    // Empirically demonstrates naive comma splitting creates invalid assetPaths
    expect(result.assetPaths).toEqual([
      'gallery/fallback.jpg',
      'gallery/image.jpg',
      'gallery/0',
      'gallery/100',
      'gallery/image-2x.jpg',
      'gallery/200'
    ]);
  });
});
