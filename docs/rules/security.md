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

`HtmlAssetResolver` removes document-supplied CSP, refresh metadata and base elements, then inserts a plugin-owned CSP as the first element of the head. Document content must never broaden that policy.

- `default-src`, `base-uri`, `connect-src`, `form-action`, `object-src`, `frame-src` and `worker-src` are restricted to `'none'`.
- Images, media and fonts use `data:` / `blob:` resources supplied through the vault reader.
- Styles use inline content; local CSS imports and URLs are resolved before serialization.
- Document scripts are disabled by default. Only the plugin bridge's random nonce is authorized.
- Script-enabled mode permits inline and embedded local scripts, without `unsafe-eval`. It is intended for trusted content, not hostile arbitrary JavaScript.
- The resolver removes nested active documents. Do not restore them by relaxing `frame-src`.

## Iframe sandboxing

The shared `PreviewPanel` creates frames with `sandbox="allow-scripts allow-modals"` and a descriptive title. `allow-scripts` permits the internal bridge even when document scripts are disabled. `allow-modals` is required for the user-requested print/PDF dialog.

**Never add `allow-same-origin` to a srcdoc frame with scripts.** The former combination allowed document code to modify the Obsidian parent DOM. Do not add form, top-navigation, popup or download privileges to fix resource-loading problems.

`VaultResources` reads assets through the vault API and embeds them as data URLs, so asset loading does not require the parent origin. Paths are decoded and normalized by segments; traversal above the vault root is rejected. CSS imports are bounded and cycle-checked.

## Bridge and lifecycle

The bridge validates the sending iframe window and a per-render token. It listens on the owning window to support pop-out panes. Internal navigation is normalized within the vault; external navigation only accepts HTTP(S) and mailto. Rejected navigation promises become diagnostics.

Unloading or refreshing invalidates outstanding renders and detaches the obsolete frame from the bridge. Results, dependency updates and error displays must be guarded after every asynchronous stage. Tabs and Markdown embeds share these boundaries.

The preview runtime validates parent commands as unknown data before reading fields. It uses standard DOM templates because Obsidian's element helpers are unavailable inside the opaque iframe. The resolver likewise parses and clones fixed scaffolding in detached documents; transformed vault CSS never attaches to the host document. Host controls use Obsidian's helpers, and their timers use the container's owning window.

Use the browser regression suite to verify parent DOM isolation, blocked network requests, trusted click routing, local resource rendering and print styles. String-only sandbox assertions are insufficient.
