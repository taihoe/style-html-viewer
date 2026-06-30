---
type: Playbook
title: Testing Standards
description: Guidelines for Jest tests, mock implementations, and verification.
tags: [testing, quality]
timestamp: 2026-06-30T10:00:00Z
---

# Testing Standards

We maintain a high standard of quality. This playbook outlines constraints on testing strategies.

## Seam-Based Testing Strategy

Because Obsidian runs in an Electron shell environment, testing internal class behavior directly under standard CLI runners is extremely hard. To keep tests robust and lightweight:

1. **Logical Isolation**: Separate processing logic (such as link parsing, path transformation, and CSP tag generation) into pure functions inside [src/engine/HtmlAssetResolver.ts](../../src/engine/HtmlAssetResolver.ts).
2. **Pure Unit Testing**: Target these pure functions directly in Jest. Since they do not depend on Obsidian view classes or UI nodes, they can run fast in isolation.
3. **Mocks**: Mock external system layers, like the Obsidian API and the asynchronous vault file-reading callback, using manual jest mocks. Keep these mocks centralized inside the `__mocks__` or test folders.

## Command

Run all tests via:
```bash
npm test
```
Ensure all tests pass 100% before submitting pull requests or publishing.
