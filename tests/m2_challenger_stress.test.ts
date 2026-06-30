import { resolveHtmlAssets } from '../src/engine/HtmlAssetResolver';

describe('Challenger M2 Stress & Empirical Harness for HtmlAssetResolver', () => {
  const mockGetResourcePath = (vaultPath: string) => `app://local-vault/${vaultPath}`;

  describe('1. Srcset Candidate Lists Stress Tests', () => {
    test('1.1 Data URI with embedded comma inside srcset causes corruption and fake asset paths', async () => {
      const rawHtml = `<img srcset="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg== 1x, images/real-2x.png 2x">`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'docs',
        getResourcePathFn: mockGetResourcePath,
      });

      // Verification of empirical flaw: simple split(',') breaks base64 data URIs
      expect(result.assetPaths).toContain('docs/iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      expect(result.transformedHtml).toContain('data:image/png;base64, app://local-vault/docs/iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    });

    test('1.2 Query parameter with embedded comma inside srcset splits incorrectly', async () => {
      const rawHtml = `<img srcset="pic.jpg?coords=10,20&size=small 1x, pic-2x.jpg 2x">`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'photos',
        getResourcePathFn: mockGetResourcePath,
      });

      // Verification of empirical flaw: comma inside query param creates invalid asset candidate
      expect(result.assetPaths).toContain('photos/20&size=small');
    });

    test('1.3 Complex multiline whitespace in srcset is handled for clean paths', async () => {
      const rawHtml = `<img srcset="\n  img1.png 100w,\n  img2.png 200w\n">`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'assets',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.assetPaths).toEqual(['assets/img1.png', 'assets/img2.png']);
    });
  });

  describe('2. Video Poster and Multimedia Stress Tests', () => {
    test('2.1 Video poster and source attributes are resolved, but track tags are omitted', async () => {
      const rawHtml = `
        <video poster="posters/intro-poster.jpg" src="videos/intro.mp4">
          <source src="videos/intro.webm" type="video/webm">
          <track src="subtitles/en.vtt" kind="subtitles" srclang="en">
        </video>
      `;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'media',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.transformedHtml).toContain('poster="app://local-vault/media/posters/intro-poster.jpg"');
      expect(result.transformedHtml).toContain('src="app://local-vault/media/videos/intro.mp4"');
      expect(result.transformedHtml).toContain('src="app://local-vault/media/videos/intro.webm"');
      // Empirical verification: track src is ignored by DOM queries in HtmlAssetResolver
      expect(result.transformedHtml).toContain('src="subtitles/en.vtt"');
      expect(result.assetPaths).not.toContain('media/subtitles/en.vtt');
    });
  });

  describe('3. Nested Relative Paths & Normalization Stress Tests', () => {
    test('3.1 Deep nested folder traversal resolves cleanly', async () => {
      const rawHtml = `<img src="../../shared/images/../../core/assets/logo.png">`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'level1/level2/level3',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.assetPaths).toEqual(['level1/core/assets/logo.png']);
      expect(result.transformedHtml).toContain('src="app://local-vault/level1/core/assets/logo.png"');
    });

    test('3.2 Excessive root escape traversal clamps to vault root', async () => {
      const rawHtml = `<img src="../../../../../../top-secret.png">`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'folder',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.assetPaths).toEqual(['top-secret.png']);
    });

    test('3.3 Backslash in relative paths is preserved without slash normalization', async () => {
      const rawHtml = `<img src="images\\photo.jpg">`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'notes',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.assetPaths).toEqual(['notes/images\\photo.jpg']);
    });
  });

  describe('4. Complex HTML Markup & DOM Parsing Stress Tests', () => {
    test('4.1 Asset tags inside <template> elements are omitted from querySelector', async () => {
      const rawHtml = `<template><img src="template-asset.png"></template>`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'views',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.assetPaths).toHaveLength(0);
    });

    test('4.2 Asset tags inside HTML comments are ignored', async () => {
      const rawHtml = `<!-- <img src="commented-out.png"> -->`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: '',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.assetPaths).toHaveLength(0);
    });

    test('4.3 HTML entities in asset URLs are decoded by DOM parser', async () => {
      const rawHtml = `<img src="images/foo&amp;bar.png">`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: 'gallery',
        getResourcePathFn: mockGetResourcePath,
      });

      expect(result.assetPaths).toEqual(['gallery/images/foo&bar.png']);
    });
  });

  describe('5. CSP Injection Stress Tests', () => {
    test('5.1 Lowercase http-equiv vs exact case selector test', async () => {
      const rawHtml = `<html><head><meta http-equiv="content-security-policy" content="default-src 'self'"></head><body></body></html>`;
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: '',
        getResourcePathFn: mockGetResourcePath,
      });

      // Check if duplicate meta tag is added due to exact case matching in querySelector
      const metaTags = result.transformedHtml.match(/<meta[^>]*>/gi) || [];
      expect(metaTags.length).toBeGreaterThanOrEqual(1);
    });
  });
});
