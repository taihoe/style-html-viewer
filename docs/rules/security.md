---
type: Playbook
title: Security & Sandboxing
description: Details on Content Security Policy (CSP), iframe sandbox attributes, and safety boundaries.
tags: [security, sandbox, csp]
timestamp: 2026-06-30T10:00:00Z
---

# Security & Sandboxing

This playbook details security guidelines and policies that protect the user from malicious HTML contents executing unsafe APIs or exfiltrating data.

## Content Security Policy (CSP)

A strict CSP must be dynamically generated and updated on all rendered documents in [src/engine/HtmlAssetResolver.ts](../../src/engine/HtmlAssetResolver.ts):

* **Allowed Protocol Schemes**: `app://local/`, `app:` and standard Obsidian custom local schemes (obtained dynamically via `vault.getResourcePath`).
* **Restriction Policy**:
  * `default-src 'none'` (deny all unless explicitly permitted).
  * `script-src 'unsafe-inline'` and allowed local schemes (restrict scripts to local assets).
  * `style-src 'unsafe-inline'` and allowed local schemes.
  * `img-src 'self' data: blob:` and allowed local schemes.
  * `media-src` (video/audio) restricted to allowed local schemes.

* **Local Stylesheet Inlining**: 
  * Because modern versions of Chromium/Obsidian enforce parent CSP boundaries that block `app://` styles from loading within sandboxed iframes, the plugin **inlines all local stylesheets**.
  * The engine reads local CSS from the vault, rewrites any relative `url()` paths inside it to absolute vault resource URIs, and injects it as an inline `<style>` element. This bypasses custom-scheme restriction boundaries because inline style blocks are explicitly permitted under the `'unsafe-inline'` directive.

## Iframe Sandboxing

The preview iframe instantiated in [src/view/HtmlView.ts](../../src/view/HtmlView.ts) must be configured with a strict subset of sandbox permissions:

* `sandbox="allow-scripts allow-forms allow-same-origin"`
* **Prohibited**: Do NOT add `allow-top-navigation`, `allow-popups-to-escape-sandbox`, or `allow-downloads` unless explicitly verified and requested by the user, as they escape the application frame bounds.
