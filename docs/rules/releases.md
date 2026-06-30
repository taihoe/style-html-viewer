---
type: Playbook
title: CI/CD Release Pipeline
description: Overview of the GitHub Actions release workflow for publishing build artifacts.
tags: [cicd, release, github-actions]
timestamp: 2026-06-30T10:00:00Z
---

# CI/CD Release Pipeline

This playbook describes how the automated release pipeline publishes plugin versions to GitHub.

## Triggering a Release

The GitHub Actions workflow defined in [.github/workflows/release.yml](../../.github/workflows/release.yml) triggers automatically on any git tag push matching the semantic version pattern:
```bash
git tag v1.0.1
git push origin v1.0.1
```

## Release Steps

1. **Dependency Installation**: Runs `npm ci` or `npm install`.
2. **Build Verification**: Runs tests using `npm test` and builds the plugin via `npm run build`.
3. **Artifact Deployment**:
   * Creates a draft/published GitHub Release matching the tag name.
   * Compiles and uploads the three required assets:
     * `main.js` (minified production build)
     * `manifest.json` (plugin manifest defining versions and dependencies)
     * `styles.css` (view and UI control styles)
