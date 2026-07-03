# ADR 1: Inline Stylesheets for Relative CSS Loading

## Status
Accepted

## Date
2026-06-30

## Context
The `obsidian-html-viewer` plugin renders HTML documents inside a sandboxed `<iframe>`. Initially, relative stylesheets were resolved to `app://local/` or custom Obsidian resource URIs and kept in `<link rel="stylesheet">` tags.

However, modern versions of Chromium and Obsidian enforce strict parent-child Content Security Policy (CSP) boundaries. These boundaries prevent stylesheets loaded via custom protocols (like `app://`) from being applied inside sandboxed iframes. As a result, relative styles failed to render, breaking document layouts.

## Decision
We decided to dynamically parse and inline all relative stylesheets:
1. **Detection**: Identify all `<link rel="stylesheet">` elements with local relative paths.
2. **File Reading**: Read the corresponding CSS files from the vault asynchronously during asset resolution.
3. **URL Rewriting**: Parse `url()` declarations in the CSS files and rewrite relative paths to absolute resource URIs.
4. **Inlining**: Replace the original `<link>` tag with an inline `<style>` element containing the resolved CSS content.

This allows styles to render correctly since inline styles are explicitly allowed via `'unsafe-inline'` in the CSP.

## Consequences
- **Correct Rendering**: Styles load and apply successfully inside the sandboxed iframe.
- **Asynchronous Pipeline**: The asset resolver (`resolveHtmlAssets`) was changed from a synchronous function to an asynchronous one returning a `Promise` because it must read files from the vault.
- **Dependency Tracking**: Watchers must track CSS file dependencies to automatically trigger re-renders when a stylesheet changes.
