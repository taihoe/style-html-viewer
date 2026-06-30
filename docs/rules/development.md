---
type: Playbook
title: Development Workflow
description: Core commands, build processes, and TypeScript development guidelines.
tags: [development, workflow]
timestamp: 2026-06-30T10:00:00Z
---

# Development Workflow

This playbook describes how to compile, build, and debug the plugin.

## Package Commands

All workflows are run via standard npm scripts defined in [package.json](../../package.json):

* **Development Compilation**: Run `npm run dev` to invoke esbuild in dev mode (which transpiles files into `main.js` with inline source maps and hot-rebuilding / watching enabled).
* **Production Build**: Run `npm run build` to compile a minified production bundle.
* **Testing**: Run `npm test` to run the Jest suite.

## TypeScript Standards

1. **Strict Types**: The workspace has `"strict": true` enabled in [tsconfig.json](../../tsconfig.json). Avoid using `any` type annotations; define specific typescript types or interfaces.
2. **ESBuild Output**: The build output file (`main.js`) must be generated in the root of the workspace. Always check that the compiler and esbuild config align (targeting `ES2021`).
