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

* [src/main.ts](../../src/main.ts) — Plugin entry point. Initializes settings, registers `HtmlView` view class, and registers event listeners.
* [src/engine/HtmlAssetResolver.ts](../../src/engine/HtmlAssetResolver.ts) — Core engine for parsing and rewriting HTML. Contains relative path conversion logic using `vault.getResourcePath` and Content Security Policy (CSP) tag injection.
* [src/ipc/IpcBridge.ts](../../src/ipc/IpcBridge.ts) — Manages message communication between the sandboxed iframe and the parent Obsidian frame (IPC). Intercepts and parses navigate/click operations.
* [src/view/HtmlView.ts](../../src/view/HtmlView.ts) — Obsidian `ItemView` wrapper. Renders the view leaf and handles toggling between Preview mode (using iframe) and Source Code mode (standard Obsidian markdown/text editor).
* [src/watcher/VaultWatcher.ts](../../src/watcher/VaultWatcher.ts) — Observes vault file modifications and handles automatic live-reloading logic by checking if modifications affect the current view or its resolved assets.

## Other Configurations

* [manifest.json](../../manifest.json) — Native Obsidian plugin manifest.
* [esbuild.config.mjs](../../esbuild.config.mjs) — Bundler build configuration to compile TypeScript files into the final `main.js` bundle.
* [jest.config.js](../../jest.config.js) / [tsconfig.json](../../tsconfig.json) — Configuration files for TypeScript compiler and Jest unit tests.
* [styles.css](../../styles.css) — Stylesheet of the plugin (primarily containing custom classes for inline error cards or ribbon bar controls).
