import { Plugin } from 'obsidian';
import { HtmlView, VIEW_TYPE_HTML } from './view/HtmlView';
import { VaultWatcher } from './watcher/VaultWatcher';

export default class HtmlViewerPlugin extends Plugin {
  public vaultWatcher: VaultWatcher;

  async onload(): Promise<void> {
    this.vaultWatcher = new VaultWatcher(this.app.vault);
    this.vaultWatcher.register();

    this.registerView(
      VIEW_TYPE_HTML,
      (leaf) => new HtmlView(leaf, this.vaultWatcher)
    );

    try {
      this.registerExtensions(['html'], VIEW_TYPE_HTML);
    } catch (e) {
      console.warn('HTML extension already registered or conflict:', e);
    }
  }

  onunload(): void {
    if (this.vaultWatcher) {
      this.vaultWatcher.unregister();
    }
  }
}

