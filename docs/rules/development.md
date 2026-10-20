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
* **Testing**: Run `npm test` to run the Jest suite; `npm run test:browser` verifies browser isolation and controls.
* **Complete checks**: `npm run check` runs type checking, lint, unit tests and the production build.

The linter uses Obsidian's official rules for DOM creation, forbidden elements and window timers, plus type-aware checks for unsafe assignments, property access, calls, arguments and returns. These checks run at error level so the review findings cannot silently return.

`styles.css` is loaded normally by Obsidian for the host controls and bundled as text for the opaque iframe. The iframe adopts that stylesheet without adding runtime style elements; older WebViews retain native `<mark>` highlighting. Both esbuild and Jest load CSS as text. Keep preview styles in this file rather than in TypeScript.

## TypeScript Standards

1. **Strict Types**: The workspace has `"strict": true` enabled in [tsconfig.json](../../tsconfig.json). Avoid using `any` type annotations; define specific typescript types or interfaces.
2. **ESBuild Output**: The build output file (`main.js`) must be generated in the root of the workspace. Always check that the compiler and esbuild config align (targeting `ES2021`).
3. **Compilation & Lint Verification**: Always verify that the codebase compiles cleanly without errors or warnings by running `npx tsc --noEmit`. Perform standard type checking and ensure all code compiles with no lint errors before committing or releasing any builds.
