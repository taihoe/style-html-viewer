import { MarkdownRenderChild, Plugin, TFile } from 'obsidian';
import { HtmlView, VIEW_TYPE_HTML } from './view/HtmlView';
import { VaultWatcher } from './watcher/VaultWatcher';
import { PreviewPanel, ScriptPreferences } from './preview/PreviewPanel';
import { folderOf, resolveVaultPath } from './engine/paths';

interface PluginData { scriptEnabledPaths: string[] }

export default class HtmlViewerPlugin extends Plugin {
  public vaultWatcher!: VaultWatcher;
  private scriptPaths = new Set<string>();
  private saveQueue: Promise<void> = Promise.resolve();
  private panels = new Set<PreviewPanel>();

  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (saved && typeof saved === 'object' && 'scriptEnabledPaths' in saved && Array.isArray(saved.scriptEnabledPaths)) {
      this.scriptPaths = new Set(saved.scriptEnabledPaths.filter((path): path is string => typeof path === 'string'));
    }
    this.vaultWatcher = new VaultWatcher(this.app.vault);
    this.vaultWatcher.register();
    const preferences: ScriptPreferences = {
      enabled: path => this.scriptPaths.has(path),
      setEnabled: async (path, enabled) => {
        const previous = this.scriptPaths.has(path);
        if (enabled) this.scriptPaths.add(path); else this.scriptPaths.delete(path);
        try { await this.persistPreferences(); }
        catch (error) { if (previous) this.scriptPaths.add(path); else this.scriptPaths.delete(path); throw error; }
        this.refreshPreviews();
      }
    };
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      let changed = false;
      for (const path of [...this.scriptPaths]) {
        if (path === oldPath || path.startsWith(oldPath + '/')) {
          this.scriptPaths.delete(path);
          this.scriptPaths.add(file.path + path.slice(oldPath.length));
          changed = true;
        }
      }
      if (changed) void this.persistPreferences().then(() => this.refreshPreviews()).catch(error => console.error('Could not save HTML script preferences:', error));
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      let changed = false;
      for (const path of [...this.scriptPaths]) {
        if (path === file.path || path.startsWith(file.path + '/')) { this.scriptPaths.delete(path); changed = true; }
      }
      if (changed) void this.persistPreferences().catch(error => console.error('Could not save HTML script preferences:', error));
    }));
    this.registerView(VIEW_TYPE_HTML, leaf => new HtmlView(leaf, this.vaultWatcher, preferences));
    for (const extension of ['html', 'htm']) {
      try { this.registerExtensions([extension], VIEW_TYPE_HTML); }
      catch (error) { console.warn(`HTML viewer: ${extension} extension already registered:`, error); }
    }
    for (const [id, name, action] of [
      ['reload', 'Reload HTML preview', (view: HtmlView) => view.refresh()],
      ['toggle-source', 'Toggle HTML source / preview', (view: HtmlView) => view.toggleSource()],
      ['find', 'Find in HTML preview', (view: HtmlView) => view.focusSearch()],
      ['print', 'Print HTML / save PDF', (view: HtmlView) => view.print()]
    ] as const) {
      this.addCommand({ id, name, checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(HtmlView);
        if (!view) return false;
        if (!checking) action(view);
        return true;
      } });
    }
    this.registerMarkdownCodeBlockProcessor('html-viewer', (source, element, context) => {
      const { app, vaultWatcher, panels } = this;
      class HtmlEmbed extends MarkdownRenderChild {
        private panel: PreviewPanel | null = null;
        onload(): void {
          try {
            const path = resolveVaultPath(folderOf(context.sourcePath), source.trim());
            const file = app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile) || !/\.(html|htm)$/i.test(file.path)) throw new Error(`HTML file not found: ${path}`);
            this.containerEl.addClass('html-viewer-embed');
            this.panel = new PreviewPanel(app, this.containerEl, vaultWatcher, preferences);
            panels.add(this.panel);
            void this.panel.load(file);
          } catch (error) { this.containerEl.createEl('p', { text: String(error), attr: { role: 'alert' } }); }
        }
        onunload(): void {
          if (this.panel) { this.panel.dispose(); panels.delete(this.panel); }
        }
      }
      context.addChild(new HtmlEmbed(element));
    });
  }

  private persistPreferences(): Promise<void> {
    const data: PluginData = { scriptEnabledPaths: [...this.scriptPaths] };
    this.saveQueue = this.saveQueue.catch(() => {}).then(() => this.saveData(data));
    return this.saveQueue;
  }

  private refreshPreviews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML).forEach(leaf => { if (leaf.view instanceof HtmlView) leaf.view.refresh(); });
    this.panels.forEach(panel => panel.refresh());
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML).forEach(leaf => { if (leaf.view instanceof HtmlView) leaf.view.disposePreview(); });
    this.panels.forEach(panel => panel.dispose());
    this.panels.clear();
    this.vaultWatcher?.unregister();
  }
}
