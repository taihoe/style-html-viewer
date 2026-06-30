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

A strict CSP must be dynamically generated and injected into the `<head>` of all rendered documents in [src/engine/HtmlAssetResolver.ts](../../src/engine/HtmlAssetResolver.ts):

* **Allowed Protocol Schemes**: `app://local/`, `app:` and standard Obsidian custom local schemes (obtained dynamically via `vault.getResourcePath`).
* **Restriction Policy**:
  * `default-src 'none'` (deny all unless explicitly permitted).
  * `script-src 'unsafe-inline'` and allowed local schemes (restrict scripts to local assets).
  * `style-src 'unsafe-inline'` and allowed local schemes.
  * `img-src 'self' data: blob:` and allowed local schemes.
  * `media-src` (video/audio) restricted to allowed local schemes.

## Iframe Sandboxing

The preview iframe instantiated in [src/view/HtmlView.ts](../../src/view/HtmlView.ts) must be configured with a strict subset of sandbox permissions:

* `sandbox="allow-scripts allow-forms allow-same-origin"`
* **Prohibited**: Do NOT add `allow-top-navigation`, `allow-popups-to-escape-sandbox`, or `allow-downloads` unless explicitly verified and requested by the user, as they escape the application frame bounds.
