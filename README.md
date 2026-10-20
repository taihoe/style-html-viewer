# Style HTML Viewer

Render `.html` and `.htm` files in Obsidian tabs or inside Markdown notes, with local styles, images, fonts, scripts and live reload.

## Preview controls

- **Source / Preview** switches between rendered HTML and a read-only source pane.
- **Run document scripts** is off by default. Enable it only for documents you trust. This per-file preference is saved and follows vault renames; it also applies to embeds of that file.
- **Assets and diagnostics** lists tracked vault dependencies, missing files, blocked resources and runtime errors. Creating a missing asset or modifying, deleting or renaming a dependency refreshes the preview.
- **Find in preview** highlights up to 1,000 matches. Enter and Shift+Enter move between matches; Escape clears the search. The heading menu jumps within the document.
- **Viewport width** offers Fit pane, Desktop (1280 px), Tablet (768 px) and Mobile (390 px). Fixed widths scroll horizontally in narrow panes.
- **Print / save PDF** opens the system print dialog for the loaded preview. Choose the system PDF destination to export. Print stylesheets retain their media conditions. Availability of printing and PDF destinations depends on the platform/webview.

The command palette provides Reload HTML preview, Toggle HTML source / preview, Find in HTML preview, and Print HTML / save PDF while an HTML tab is active.

## Embed an HTML file in Markdown

Add an `html-viewer` fenced block containing a vault file path:

````markdown
```html-viewer
../lessons/example.html
```
````

Paths resolve relative to the Markdown note. Prefix a path with `/` to start at the vault root. The embed uses the same controls, isolation, diagnostics and live reload as a workspace tab. It works wherever Obsidian renders Markdown code blocks, including Reading view and rendered Live Preview blocks. Its bottom edge can be dragged to resize it.

## Local resources and security

Relative paths, percent-encoded filenames, image `srcset`, CSS `url()` and recursive local CSS imports are resolved through the vault API. Stylesheets are inlined with their media, layer and supports conditions preserved. Binary assets and local scripts are embedded as data URLs so the preview can run with an opaque origin.

The iframe uses `sandbox="allow-scripts allow-modals"`. It never receives same-origin, form-submission, top-navigation, popup or download privileges. Only the plugin's nonce-authorized bridge runs when document scripts are disabled. The bridge provides navigation, search, diagnostics and printing. Enabling document scripts permits local interactivity; it does not grant access to the Obsidian parent DOM or APIs.

A plugin-owned CSP is inserted before document scripts and replaces document-supplied policies. It blocks external resource loads, network connections, forms, workers and nested active documents. External links are opened through the parent bridge; vault links open in Obsidian. Use script-enabled mode only for trusted content: resource CSP is not a general-purpose guarantee against every action arbitrary JavaScript can attempt.

Remote styles/scripts/fonts, nested iframes/objects, and runtime-relative module imports are not supported. Missing resources appear in diagnostics instead of weakening isolation. Preview limits are 10 MB of HTML, 32 MB per asset, 100 MB of loaded assets, 32 import levels and 256 stylesheet references. Source mode remains available for inspection when previewing is unsuitable.

## Development

```sh
npm ci
npm run dev        # watch and rebuild main.js
npm run check      # typecheck, lint, unit tests, production build
npm run test:browser
```

Browser checks use installed Google Chrome on macOS, `BROWSER_EXECUTABLE` when supplied, or Playwright Chromium (`npx playwright install chromium`). They exercise the minified browser bundle with an Obsidian API mock; a real Obsidian desktop/mobile smoke test is still recommended before release.

The development dependency override for `@istanbuljs/load-nyc-config` selects `js-yaml` 4.3.2+ to remove its vulnerable legacy `argparse` / `sprintf-js` chain. The loader uses the compatible `load()` API. Keep the override until the upstream loader adopts a patched dependency chain.

## Developer playbooks

- [Workspace agent instructions](AGENTS.md)
- [Architecture](docs/rules/architecture.md)
- [Development workflow](docs/rules/development.md)
- [Testing standards](docs/rules/testing.md)
- [Security and sandboxing](docs/rules/security.md)
- [Release workflow](docs/rules/releases.md)
