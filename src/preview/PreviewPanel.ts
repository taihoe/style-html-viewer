import { App, TFile } from 'obsidian';
import { AssetDiagnostic, createBridgeToken, resolveHtmlAssets } from '../engine/HtmlAssetResolver';
import { folderOf } from '../engine/paths';
import { IpcBridge, PreviewMessage } from '../ipc/IpcBridge';
import { VaultWatcher } from '../watcher/VaultWatcher';
import { VaultResources } from './VaultResources';

export interface ScriptPreferences {
  enabled: (path: string) => boolean;
  setEnabled: (path: string, enabled: boolean) => Promise<void>;
}

/** One preview implementation shared by FileView tabs and Markdown render children. */
export class PreviewPanel {
  private file: TFile | null = null;
  private registeredPath = '';
  private generation = 0;
  private disposed = false;
  private mode: 'preview' | 'source' = 'preview';
  private reloadTimer: number | undefined;
  private searchTimer: number | undefined;
  private readonly hostWindow: Window;
  private viewport: HTMLDivElement;
  private outline: HTMLSelectElement;
  private search: HTMLInputElement;
  private matches: HTMLElement;
  private diagnosticsList: HTMLElement;
  private diagnosticsSummary: HTMLElement;
  private scripts: HTMLInputElement;
  private sourceButton: HTMLButtonElement;
  private printButton: HTMLButtonElement;
  private bridge: IpcBridge;
  private diagnosticEntries: AssetDiagnostic[] = [];
  private dependencies: string[] = [];
  private width = '100%';
  private ready = false;
  private queryReady = false;
  private readonly reloadCallback = () => {
    this.invalidate();
    this.hostWindow.clearTimeout(this.reloadTimer);
    this.reloadTimer = this.hostWindow.setTimeout(() => { void this.render(); }, 80);
  };

  constructor(
    private app: App,
    private container: HTMLElement,
    private watcher: VaultWatcher,
    private preferences: ScriptPreferences
  ) {
    this.hostWindow = container.ownerDocument.defaultView || window;
    container.empty();
    container.addClass('html-viewer-container');
    const toolbar = container.createDiv({ cls: 'html-viewer-toolbar' });
    toolbar.setAttribute('aria-label', 'HTML preview controls');
    this.sourceButton = this.button(toolbar, 'Source', () => this.toggleSource());
    this.button(toolbar, 'Reload', () => { void this.render(); });
    const scriptLabel = toolbar.createEl('label', { cls: 'html-viewer-script-toggle' });
    this.scripts = scriptLabel.createEl('input', { attr: { type: 'checkbox' } });
    scriptLabel.append('Run document scripts');
    scriptLabel.title = 'Enable only for HTML you trust. Scripts remain isolated from Obsidian.';
    this.scripts.addEventListener('change', () => {
      const file = this.file;
      if (!file) return;
      this.scripts.disabled = true;
      void preferences.setEnabled(file.path, this.scripts.checked).then(() => this.render()).catch(error => {
        this.report({ kind: 'error', path: file.path, message: String(error) });
        this.scripts.checked = preferences.enabled(file.path);
      }).finally(() => { if (!this.disposed) this.scripts.disabled = false; });
    });
    const size = toolbar.createEl('select', { attr: { 'aria-label': 'Preview viewport width' } });
    for (const [value, label] of [['100%', 'Fit pane'], ['1280px', 'Desktop · 1280 px'], ['768px', 'Tablet · 768 px'], ['390px', 'Mobile · 390 px']]) {
      size.createEl('option', { text: label, attr: { value } });
    }
    size.addEventListener('change', () => { this.width = size.value; this.applyWidth(); });
    this.printButton = this.button(toolbar, 'Print / save PDF', () => this.print());
    this.printButton.disabled = true;
    const navigation = container.createDiv({ cls: 'html-viewer-navigation' });
    this.search = navigation.createEl('input', { attr: { type: 'search', placeholder: 'Find in preview', 'aria-label': 'Find in preview', maxlength: '300' } });
    this.search.addEventListener('input', () => {
      this.hostWindow.clearTimeout(this.searchTimer);
      this.searchTimer = this.hostWindow.setTimeout(() => this.find(), 120);
    });
    this.search.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); this.bridge.send({ action: 'next', direction: event.shiftKey ? -1 : 1 }); }
      if (event.key === 'Escape') { this.search.value = ''; this.find(); }
    });
    this.button(navigation, 'Previous match', () => this.bridge.send({ action: 'next', direction: -1 }));
    this.button(navigation, 'Next match', () => this.bridge.send({ action: 'next', direction: 1 }));
    this.matches = navigation.createSpan({ attr: { role: 'status', 'aria-live': 'polite' } });
    this.outline = navigation.createEl('select', { attr: { 'aria-label': 'Document headings' } });
    this.outline.addEventListener('change', () => { if (this.outline.value) this.bridge.send({ action: 'heading', id: this.outline.value }); });
    const diagnostics = container.createEl('details', { cls: 'html-viewer-diagnostics' });
    this.diagnosticsSummary = diagnostics.createEl('summary', { text: 'Assets and diagnostics' });
    this.diagnosticsList = diagnostics.createDiv();
    this.viewport = container.createDiv({ cls: 'html-viewer-preview-container' });
    this.bridge = new IpcBridge(app, () => this.file?.path || '', message => this.onMessage(message), this.hostWindow);
    this.bridge.attach();
  }

  private button(parent: HTMLElement, text: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl('button', { text, attr: { type: 'button', 'aria-label': text } });
    button.addEventListener('click', action);
    return button;
  }

  public async load(file: TFile): Promise<void> {
    this.invalidate();
    this.watcher.unregisterCallback(this.reloadCallback);
    this.file = file;
    this.registeredPath = file.path;
    this.watcher.registerView(file.path, this.reloadCallback);
    await this.render();
  }

  public unload(): void {
    this.invalidate();
    this.hostWindow.clearTimeout(this.reloadTimer);
    this.hostWindow.clearTimeout(this.searchTimer);
    this.watcher.unregisterCallback(this.reloadCallback);
    this.file = null;
    this.registeredPath = '';
    this.bridge.setIframe(null);
    this.viewport.empty();
  }

  public dispose(): void {
    this.disposed = true;
    this.unload();
    this.bridge.detach();
  }

  public toggleSource(): void { this.mode = this.mode === 'preview' ? 'source' : 'preview'; void this.render(); }
  public focusSearch(): void { this.search.focus(); this.search.select(); }
  public print(): void { if (this.ready && this.mode === 'preview') this.bridge.send({ action: 'print' }); }
  public refresh(): void { void this.render(); }

  private invalidate(): void {
    this.generation++;
    this.ready = false;
    this.queryReady = false;
    this.printButton.disabled = true;
    // An obsolete document cannot keep issuing navigation while a new file is loading.
    this.bridge.setIframe(null);
  }

  private applyWidth(): void {
    this.viewport.querySelector('iframe')?.style.setProperty('width', this.width);
  }

  private find(): void {
    if (this.queryReady) this.bridge.send({ action: 'find', query: this.search.value });
  }

  private onMessage(message: PreviewMessage): void {
    if (message.type === 'html-viewer-ready') { this.queryReady = true; this.find(); }
    if (message.type === 'html-viewer-find' && typeof message.count === 'number' && typeof message.current === 'number') {
      this.matches.textContent = message.count ? `${message.current} / ${message.count}${message.count >= 1000 ? '+' : ''}` : (this.search.value ? 'No matches' : '');
    }
    if (message.type === 'html-viewer-diagnostic' && typeof message.path === 'string' && typeof message.message === 'string') {
      this.report({ kind: 'blocked', path: message.path.slice(0, 400), message: message.message.slice(0, 500) });
    }
  }

  private report(diagnostic: AssetDiagnostic): void {
    if (this.disposed || this.diagnosticEntries.length >= 200) return;
    if (!this.diagnosticEntries.some(entry => entry.path === diagnostic.path && entry.message === diagnostic.message)) this.diagnosticEntries.push(diagnostic);
    this.showDiagnostics();
  }

  private showDiagnostics(): void {
    this.diagnosticsSummary.textContent = `Assets (${this.dependencies.length}) · Issues (${this.diagnosticEntries.length})`;
    this.diagnosticsList.empty();
    if (!this.diagnosticEntries.length) this.diagnosticsList.createEl('p', { text: 'No asset issues reported.' });
    const issues = this.diagnosticsList.createEl('ul');
    for (const entry of this.diagnosticEntries) issues.createEl('li', { text: `${entry.path}: ${entry.message}` });
    if (this.dependencies.length) {
      this.diagnosticsList.createEl('p', { text: 'Tracked vault dependencies:' });
      const assets = this.diagnosticsList.createEl('ul');
      for (const path of this.dependencies) assets.createEl('li', { text: path });
    }
  }

  private async render(): Promise<void> {
    if (this.disposed || !this.file) return;
    this.invalidate();
    this.hostWindow.clearTimeout(this.reloadTimer);
    const id = this.generation;
    const file = this.file;
    const path = file.path;
    const mode = this.mode;
    const current = () => !this.disposed && id === this.generation && this.file === file && file.path === path && this.mode === mode;
    if (this.registeredPath !== path) {
      this.watcher.unregisterCallback(this.reloadCallback);
      this.watcher.registerView(path, this.reloadCallback);
      this.registeredPath = path;
    }
    this.scripts.checked = this.preferences.enabled(path);
    this.sourceButton.textContent = mode === 'preview' ? 'Source' : 'Preview';
    this.search.disabled = mode !== 'preview';
    this.outline.disabled = mode !== 'preview';
    this.matches.textContent = '';
    this.diagnosticEntries = [];
    this.dependencies = [];
    this.showDiagnostics();
    this.viewport.empty();
    this.viewport.createEl('p', { text: 'Loading…', attr: { role: 'status' } });
    try {
      const rawHtml = await this.app.vault.read(file);
      if (!current()) return;
      if (mode === 'source') {
        this.watcher.updateDependencies(path, [], this.reloadCallback);
        this.viewport.empty();
        this.viewport.createEl('pre', { cls: 'html-viewer-source-container', text: rawHtml });
        return;
      }
      if (!rawHtml.replace(/\0/g, '').trim()) throw new Error('HTML file is empty');
      if (rawHtml.length > 10 * 1024 * 1024) throw new Error('HTML file exceeds the 10 MB preview limit');
      const resources = new VaultResources(this.app.vault);
      const token = createBridgeToken();
      const result = await resolveHtmlAssets({
        rawHtml, currentFileFolderPath: folderOf(path), bridgeToken: token,
        allowScripts: this.preferences.enabled(path),
        getResourcePathFn: asset => resources.dataUrl(asset),
        readVaultFileFn: asset => resources.readText(asset)
      });
      if (!current()) return;
      this.dependencies = result.assetPaths;
      this.diagnosticEntries = result.diagnostics.slice(0, 200);
      this.watcher.updateDependencies(path, result.assetPaths, this.reloadCallback);
      this.showDiagnostics();
      this.outline.empty();
      this.outline.createEl('option', { text: 'Jump to heading…', attr: { value: '' } });
      for (const heading of result.headings) this.outline.createEl('option', { text: `${'— '.repeat(heading.level - 1)}${heading.text}`, attr: { value: heading.id } });
      this.viewport.empty();
      const frame = this.viewport.createEl('iframe', {
        cls: 'html-viewer-iframe', attr: { sandbox: 'allow-scripts allow-modals', title: `HTML preview: ${file.basename}`, referrerpolicy: 'no-referrer' }
      });
      this.bridge.setIframe(frame, token);
      frame.addEventListener('load', () => {
        if (!current()) return;
        this.ready = true;
        this.printButton.disabled = false;
      }, { once: true });
      frame.srcdoc = result.transformedHtml;
      this.applyWidth();
    } catch (error) {
      if (!current()) return;
      this.bridge.setIframe(null);
      this.viewport.empty();
      const errorContainer = this.viewport.createDiv({ cls: 'html-viewer-error-container' });
      const card = errorContainer.createDiv({ cls: 'html-viewer-error-card' });
      const header = card.createDiv({ cls: 'html-viewer-error-header' });
      header.createEl('strong', { cls: 'html-viewer-error-title', text: 'Error Loading HTML File' });
      card.createEl('p', { cls: 'html-viewer-error-message', text: error instanceof Error ? error.message : String(error) });
      this.report({ kind: 'error', path, message: error instanceof Error ? error.message : String(error) });
    }
  }
}
