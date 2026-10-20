---
type: Reference
title: Project Architecture
description: Deep-dive overview of the obsidian-html-viewer codebase structure and files.
tags: [architecture, codebase]
timestamp: 2026-06-30T10:00:00Z
---

# Project Architecture

The `obsidian-html-viewer` plugin is structured with clean separation of concerns, separating pure DOM and path resolution logic from Obsidian's UI views and watchers.

## Code Directory Structure

* [src/main.ts](../../src/main.ts) — Plugin entry point. Loads per-file script preferences, registers Markdown embeds and commands, registers `HtmlView` view class, and registers event listeners.
* [src/engine/HtmlAssetResolver.ts](../../src/engine/HtmlAssetResolver.ts) — Core engine for parsing and rewriting HTML. Contains relative path conversion logic using `vault.getResourcePath`, local stylesheet inlining, and Content Security Policy (CSP) tag updating.
* [src/ipc/IpcBridge.ts](../../src/ipc/IpcBridge.ts) — Manages message communication between the sandboxed iframe and the parent Obsidian frame (IPC). Intercepts and parses navigate/click operations.
* [src/view/HtmlView.ts](../../src/view/HtmlView.ts) — Obsidian `FileView` wrapper. Renders the view leaf and handles toggling between Preview mode (using iframe) and Source Code mode (read-only HTML source pane).
* [src/watcher/VaultWatcher.ts](../../src/watcher/VaultWatcher.ts) — Observes vault file modifications and handles automatic live-reloading logic by checking if modifications affect the current view or its resolved assets.

* `src/preview/PreviewPanel.ts` — Shared controls, cancellable rendering, diagnostics and bridge lifecycle for tabs and Markdown embeds.
* `src/preview/VaultResources.ts` — Bounded vault reads and data-URL encoding for opaque frames.
* `src/engine/paths.ts` / `src/engine/css.ts` — Vault containment, URL/srcset parsing and recursive stylesheet processing.

## Other Configurations

* [manifest.json](../../manifest.json) — Native Obsidian plugin manifest.
* [esbuild.config.mjs](../../esbuild.config.mjs) — Bundler build configuration to compile TypeScript files into the final `main.js` bundle.
* [jest.config.js](../../jest.config.js) / [tsconfig.json](../../tsconfig.json) — Configuration files for TypeScript compiler and Jest unit tests.
* [styles.css](../../styles.css) — Stylesheet of the plugin (primarily containing custom classes for inline error cards or ribbon bar controls).
