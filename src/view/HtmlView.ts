import { FileView, WorkspaceLeaf, TFile } from 'obsidian';
import { PreviewPanel, ScriptPreferences } from '../preview/PreviewPanel';
import { VaultWatcher } from '../watcher/VaultWatcher';

export const VIEW_TYPE_HTML = 'html-viewer-view';

/** Obsidian file lifecycle adapter; the same preview is also used by Markdown embeds. */
export class HtmlView extends FileView {
  private panel: PreviewPanel | null = null;
  private actionsRegistered = false;
  private watcher: VaultWatcher;
  private shared: boolean;
  private preferences: ScriptPreferences;

  constructor(leaf: WorkspaceLeaf, watcher?: VaultWatcher, preferences?: ScriptPreferences) {
    super(leaf);
    this.shared = Boolean(watcher);
    this.watcher = watcher || new VaultWatcher(this.app?.vault);
    if (!this.shared) this.watcher.register();
    const scripts = new Set<string>();
    this.preferences = preferences || {
      enabled: path => scripts.has(path),
      setEnabled: async (path, enabled) => { if (enabled) scripts.add(path); else scripts.delete(path); }
    };
  }

  public getViewType(): string { return VIEW_TYPE_HTML; }
  public getDisplayText(): string { return this.file?.basename || 'HTML Viewer'; }
  public canAcceptExtension(extension: string): boolean { return /^(html|htm)$/i.test(extension); }

  private ensurePanel(): PreviewPanel {
    if (!this.panel) this.panel = new PreviewPanel(this.app, this.contentEl, this.watcher, this.preferences);
    return this.panel;
  }

  public async onLoadFile(file: TFile): Promise<void> {
    this.file = file;
    const render = this.ensurePanel().load(file);
    await super.onLoadFile(file);
    await render;
  }

  public async onUnloadFile(file: TFile): Promise<void> {
    this.panel?.unload();
    await super.onUnloadFile(file);
  }

  public async onRename(file: TFile): Promise<void> {
    await super.onRename(file);
    await this.ensurePanel().load(file);
  }

  public async onOpen(): Promise<void> {
    this.ensurePanel();
    if (!this.actionsRegistered) {
      this.actionsRegistered = true;
      this.addAction('code', 'Toggle source code', () => this.toggleSource());
      this.addAction('refresh-cw', 'Reload', () => this.refresh());
      this.addAction('search', 'Find in HTML preview', () => this.focusSearch());
      this.addAction('printer', 'Print / save PDF', () => this.print());
    }
  }

  public refresh(): void { this.panel?.refresh(); }
  public toggleSource(): void { this.panel?.toggleSource(); }
  public focusSearch(): void { this.panel?.focusSearch(); }
  public print(): void { this.panel?.print(); }

  public disposePreview(): void {
    this.panel?.dispose();
    this.panel = null;
  }

  public async onClose(): Promise<void> {
    this.disposePreview();
    if (!this.shared) this.watcher.unregister();
    this.actionsRegistered = false;
    await super.onClose();
  }
}
