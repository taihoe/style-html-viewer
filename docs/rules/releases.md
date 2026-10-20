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

Update `manifest.json`, `package.json` and both root version entries in `package-lock.json` together. Add the release description in `docs/releases/<version>.md`. Run `npm run check` and `npm run test:browser` before tagging.

The GitHub Actions workflow defined in [.github/workflows/release.yml](../../.github/workflows/release.yml) triggers on tag pushes. Use the exact version from the manifest without a `v` prefix, as required by Obsidian:
```bash
git tag -a 1.0.6 -m "Release 1.0.6"
git push origin main refs/tags/1.0.6
```

## Release Steps

1. **Dependency Installation**: Runs `npm ci`.
2. **Metadata Validation**: Requires an `x.y.z` tag matching the manifest, package and lockfile versions, and checks that release notes exist.
3. **Build Verification**: Runs `npm run check` to type-check, lint, test and build the production plugin.
4. **Build Provenance**: Attests the three release assets.
5. **Artifact Deployment**:
   * Publishes a GitHub Release matching the tag name with the prepared notes and generated changelog.
   * Compiles and uploads the three required assets:
     * `main.js` (minified production build)
     * `manifest.json` (plugin manifest defining versions and dependencies)
     * `styles.css` (view and UI control styles)

After the workflow completes, verify that the release is published, all three assets are attached, and the uploaded manifest reports the expected version. The local browser suite uses an Obsidian mock; a desktop/mobile device smoke test remains a separate release check.
