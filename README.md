# Style HTML Viewer

An Obsidian plugin that enables rendering of `.html` files directly within Obsidian workspace tabs.

## Features

- **Workspace View Integration**: Open HTML files inside a dedicated custom view tab.
- **Preview & Source Editor**: Toggle between a sandboxed rendered preview and raw HTML source code.
- **DOM Relative Asset Resolution**: Automatically parses HTML and converts relative resources (`css`, `js`, images, audio, video) to valid local Obsidian vault URIs using `vault.getResourcePath`.
- **IPC Link Interception**: Intercepts links to local `.md` or `.html` files and opens them in native Obsidian workspace tabs. External web links (`http(s)`) are opened in the default browser.
- **Security Sandboxing & CSP**: Executes pages inside an `<iframe>` with strict sandbox flags and enforces a strict, local-only Content Security Policy (CSP).
- **Live Reloading**: Automatically re-renders the preview when the HTML file or any of its CSS/JS dependencies in the vault are modified.

---

## Development

### Setup and Commands

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Development compiler** (with source mapping and file watching):
   ```bash
   npm run dev
   ```

3. **Production build**:
   ```bash
   npm run build
   ```

4. **Run test suite**:
   ```bash
   npm test
   ```

---

## Developer Playbooks & References

For agent instructions, rules, and detailed technical specifications, see:

- [Workspace Agent Instructions](AGENTS.md) - Primary guidelines for AI coding agents.
- [Project Architecture](docs/rules/architecture.md) - Deep-dive codebase structure.
- [Development Workflow](docs/rules/development.md) - Compilation guidelines and scripts.
- [Testing Standards](docs/rules/testing.md) - Seam-based testing constraints and Jest setup.
- [Security & Sandboxing](docs/rules/security.md) - Content Security Policy (CSP) and iframe details.
- [CI/CD Release Pipeline](docs/rules/releases.md) - Automatic GitHub release workflow instructions.
