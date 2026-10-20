# Directory Update Log

## 2026-06-30
* **Restructuring**: Moved the OKF knowledge bundle from `.agents/` to `docs/`, added a root `README.md`, and migrated `PRD.md` to `docs/PRD.md` with OKF frontmatter.
* **Initialization**: Created the OKF knowledge bundle structure for workspace agent instructions.
* **Creation**: Added the root [AGENTS](../AGENTS.md) rules entry point.
* **Creation**: Added architectural, development, testing, security, and release playbooks under [rules/](rules/).

## 2026-10-20 — Secure preview and controls

Replaced the unsafe same-origin sandbox guidance with opaque-origin rendering and vault-embedded resources. Updated the CSP, source-mode description, asset/import behavior and browser testing guidance. Added documentation for script preferences, diagnostics, search/outline, viewport sizes, Markdown embeds, commands, `.htm` and print/PDF.

## 2026-10-20 — Obsidian review corrections

Enabled the reported Obsidian lint rules and type-aware unsafe-value checks. Moved search styling into `styles.css`, adopted its bundled text inside the isolated preview, replaced native element creation with fixed inert templates where Obsidian helpers are unavailable, validated incoming commands and bound debounce timers to the preview's owning window. Added regressions for command validation, isolated styling and popout timer cleanup.
