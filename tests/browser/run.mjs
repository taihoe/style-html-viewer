import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bundled = await build({
  stdin: { contents: `import Plugin from './src/main'; import { TFile } from 'obsidian'; import { resolveHtmlAssets } from './src/engine/HtmlAssetResolver'; window.harness = { Plugin, TFile, resolveHtmlAssets };`, resolveDir: root },
  bundle: true, write: false, platform: 'browser', target: 'es2021', minify: true,
  loader: { '.css': 'text' },
  alias: { obsidian: path.join(root, '__mocks__/obsidian.js') }
});
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let executablePath = process.env.BROWSER_EXECUTABLE;
if (!executablePath) { try { await access(localChrome); executablePath = localChrome; } catch { /* Use Playwright's installed Chromium on CI. */ } }
const browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  const requests = [];
  await page.route('https://blocked.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
  await page.setContent('<!doctype html><html><body><div id="parent-marker">untouched</div><main id="root" style="height:800px"></main><div id="embed"></div></body></html>');
  await page.addStyleTag({ content: await readFile(path.join(root, 'styles.css'), 'utf8') });
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  await page.evaluate(async () => {
    const { Plugin, TFile } = window.harness;
    const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src *; connect-src *"><link rel="stylesheet" href="assets/main.css"><link rel="stylesheet" media="print" href="assets/print.css"><h1>Lesson heading</h1><h2>Search section</h2><p>needle alpha needle beta</p><img id="local-image" src="assets/pixel.png"><img src="https://blocked.invalid/tracker.png"><form action="https://blocked.invalid/form"><button>Submit</button></form><a id="note-link" href="sub/../target.md"><strong>Open note</strong></a><script>window.documentScriptRan=true; try{parent.document.getElementById('parent-marker').textContent='escaped'}catch(e){document.body.dataset.isolated='true'}; fetch('https://blocked.invalid/fetch').catch(()=>{});window.print=()=>{document.body.dataset.printed='true';window.dispatchEvent(new Event('afterprint'))}</script>`;
    const content = new Map([
      ['lessons/page.html', html], ['lessons/assets/main.css', '@import "nested/theme.css"; body{background:white}'],
      ['lessons/assets/nested/theme.css', 'h1{color:rgb(12, 34, 56)}'], ['lessons/assets/print.css', 'h1{color:rgb(200, 0, 0)}'],
      ['lessons/assets/pixel.png', 'binary'], ['lessons/target.md', 'note']
    ]);
    const files = new Map([...content].map(([path, text]) => [path, Object.assign(new TFile(), { path, basename: path.split('/').pop(), stat: { size: text.length }, parent: { path: path.slice(0, path.lastIndexOf('/')) } })]));
    const listeners = new Map();
    const vault = {
      read: async file => content.get(file.path),
      readBinary: async () => Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+javkAAAAASUVORK5CYII='), c => c.charCodeAt(0)).buffer,
      getAbstractFileByPath: path => files.get(path),
      on: (name, callback) => { const callbacks = listeners.get(name) || new Set(); callbacks.add(callback); listeners.set(name, callbacks); return { name, callback }; },
      offref: ref => listeners.get(ref.name)?.delete(ref.callback)
    };
    const opened = [];
    const leaves = [];
    const app = { vault, workspace: { openLinkText: async (...args) => opened.push(args), getLeavesOfType: () => leaves, getActiveViewOfType: () => leaves[0]?.view } };
    const plugin = new Plugin(app);
    await plugin.onload();
    const leaf = { app };
    const view = plugin.views.get('html-viewer-view')(leaf);
    leaf.view = view;
    leaves.push(leaf);
    document.getElementById('root').append(view.contentEl);
    view.contentEl.style.height = '100%';
    await view.onOpen();
    await view.onLoadFile(files.get('lessons/page.html'));
    window.fixture = { plugin, view, files, content, listeners, opened };
  });
  const preview = () => page.frames().find(frame => frame !== page.mainFrame() && frame.url() === 'about:srcdoc');
  await page.waitForFunction(() => document.querySelector('button[aria-label="Print / save PDF"]')?.disabled === false);
  let frame = preview();
  assert(frame, 'preview frame exists');
  assert.equal(await frame.evaluate(() => window.documentScriptRan), undefined, 'document scripts disabled by default');
  assert.equal(await frame.locator('h1').evaluate(el => getComputedStyle(el).color), 'rgb(12, 34, 56)', 'nested stylesheet applies, print stylesheet does not');
  assert.equal(await frame.locator('#local-image').evaluate(el => el.naturalWidth), 1, 'vault image works in an opaque frame');
  assert.equal(await page.locator('#parent-marker').textContent(), 'untouched');
  await page.getByRole('searchbox', { name: 'Find in preview' }).fill('needle');
  await frame.locator('mark.html-viewer-match').first().waitFor();
  assert.equal(await frame.locator('mark.html-viewer-match').count(), 2);
  assert.equal(await frame.locator('mark.html-viewer-match').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 225, 106)', 'bundled styles.css highlights search matches inside the opaque iframe');
  assert.equal(await frame.locator('mark.html-viewer-current-match').evaluate(el => getComputedStyle(el).outlineWidth), '2px');
  assert.equal(await frame.locator('style').count(), 2, 'the runtime does not append style elements beyond the document’s two vault stylesheets');
  assert.equal(await frame.evaluate(() => document.adoptedStyleSheets.length), 1);
  assert.equal(await frame.evaluate(() => typeof document.body.createEl), 'undefined', 'preview controls do not require Obsidian DOM extensions');
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  assert.equal(await page.locator('.html-viewer-navigation [role="status"]').textContent(), '2 / 2');
  const heading = await page.locator('select[aria-label="Document headings"] option').nth(2).getAttribute('value');
  await page.getByLabel('Document headings').selectOption(heading);
  await page.getByLabel('Preview viewport width').selectOption('390px');
  assert.equal(await page.locator('iframe').evaluate(el => el.getBoundingClientRect().width), 390);
  await frame.locator('#note-link strong').click();
  assert.deepEqual(await page.evaluate(() => window.fixture.opened[0]), ['lessons/target.md', 'lessons/page.html', false]);
  await frame.locator('#note-link').evaluate(element => element.click());
  assert.equal(await page.evaluate(() => window.fixture.opened.length), 1, 'synthetic clicks cannot request navigation');
  await page.locator('.html-viewer-script-toggle input').check();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Print / save PDF"]')?.disabled === false && document.querySelector('.html-viewer-script-toggle input')?.disabled === false);
  frame = preview();
  await frame.waitForFunction(() => window.documentScriptRan === true);
  assert.equal(await frame.locator('body').getAttribute('data-isolated'), 'true', 'script cannot access parent DOM');
  assert.equal(await page.locator('#parent-marker').textContent(), 'untouched');
  await page.getByRole('button', { name: 'Print / save PDF', exact: true }).click();
  await frame.waitForFunction(() => document.body.dataset.printed === 'true');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await frame.locator('h1').evaluate(el => getComputedStyle(el).color), 'rgb(200, 0, 0)', 'print stylesheet survives transformation');
  await page.emulateMedia({ media: 'screen' });
  assert.deepEqual(requests, [], 'document CSP blocks remote resources and fetch before network requests');
  assert.equal(await page.locator('.html-viewer-diagnostics').textContent().then(text => text.includes('blocked.invalid')), true);
  await page.evaluate(() => {
    const children = [];
    window.fixture.plugin.processors.get('html-viewer')('page.html', document.getElementById('embed'), { sourcePath: 'lessons/note.md', addChild: child => { children.push(child); child.load(); } });
    window.fixture.children = children;
  });
  await page.locator('#embed iframe').waitFor();
  const embedFrame = await (await page.locator('#embed iframe').elementHandle()).contentFrame();
  await embedFrame.locator('h1').waitFor();
  assert.equal(await embedFrame.locator('h1').textContent(), 'Lesson heading');
  assert((await page.locator('#embed iframe').boundingBox()).height > 200, 'embed has a usable preview height');
  assert.equal(await page.locator('#embed iframe').getAttribute('sandbox'), 'allow-scripts allow-modals');
  assert.deepEqual(await page.evaluate(() => window.fixture.plugin.extensions), ['html', 'htm']);
  assert.equal(await page.evaluate(() => window.fixture.plugin.commands.length), 4);
  assert.deepEqual(await page.evaluate(() => window.fixture.plugin.savedData.scriptEnabledPaths), ['lessons/page.html']);
  if (process.env.PREVIEW_SCREENSHOT) await page.screenshot({ path: process.env.PREVIEW_SCREENSHOT, fullPage: true });
  await page.evaluate(async () => { window.fixture.children.forEach(child => child.unload()); await window.fixture.view.onClose(); window.fixture.plugin.onunload(); });
  assert.equal(await page.locator('iframe').count(), 0);
  console.log('Browser checks passed: CSP, opaque sandbox, script controls, local assets, CSS imports/print, search, outline, viewport, navigation, print, Markdown embeds, commands and teardown.');
} finally { await browser.close(); }
