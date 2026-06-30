import { FileView, WorkspaceLeaf, TFile } from 'obsidian';
import { resolveHtmlAssets } from '../engine/HtmlAssetResolver';
import { IpcBridge } from '../ipc/IpcBridge';
import { VaultWatcher } from '../watcher/VaultWatcher';

export const VIEW_TYPE_HTML = 'html-viewer-view';

export class HtmlView extends FileView {
  private mode: 'preview' | 'source' = 'preview';
  private ipcBridge: IpcBridge;
  private vaultWatcher: VaultWatcher;
  private renderId = 0;
  private actionsRegistered = false;
  private reloadCallback: () => void;

  private isWatcherShared = false;

  constructor(leaf: WorkspaceLeaf, vaultWatcher?: VaultWatcher) {
    super(leaf);
    this.ipcBridge = new IpcBridge(this.app, () => this.file ? this.file.path : '');
    this.reloadCallback = () => this.renderView();
    if (vaultWatcher) {
      this.vaultWatcher = vaultWatcher;
      this.isWatcherShared = true;
    } else {
      this.vaultWatcher = new VaultWatcher(
        this.app ? this.app.vault : null,
        () => this.file ? this.file.path : null,
        this.reloadCallback
      );
      this.isWatcherShared = false;
    }
  }

  public getViewType(): string {
    return VIEW_TYPE_HTML;
  }

  public getDisplayText(): string {
    return this.file ? this.file.basename : 'HTML Viewer';
  }

  public async onLoadFile(file: TFile): Promise<void> {
    this.file = file;
    const basePromise = super.onLoadFile(file);
    this.vaultWatcher.registerView(file.path, this.reloadCallback);
    const renderPromise = this.renderView();
    await basePromise;
    await renderPromise;
  }

  public async onUnloadFile(file: TFile): Promise<void> {
    this.vaultWatcher.unregisterView(file.path, this.reloadCallback);
    await super.onUnloadFile(file);
  }

  public async onOpen(): Promise<void> {
    this.ipcBridge.attach();
    if (this.file) {
      this.vaultWatcher.registerView(this.file.path, this.reloadCallback);
    }
    if (!this.actionsRegistered) {
      this.actionsRegistered = true;
      this.addAction('code', 'Toggle source code', () => {
        this.mode = this.mode === 'preview' ? 'source' : 'preview';
        this.renderView();
      });
      this.addAction('refresh-cw', 'Reload', () => {
        this.renderView();
      });
    }
  }

  public async onClose(): Promise<void> {
    this.ipcBridge.detach();
    if (this.file) {
      this.vaultWatcher.unregisterView(this.file.path, this.reloadCallback);
    }
    if (!this.isWatcherShared) {
      this.vaultWatcher.unregister();
    }
    this.actionsRegistered = false;
    await super.onClose();
  }

  private async renderView(): Promise<void> {
    if (!this.file) return;
    const container = this.contentEl;
    container.empty();
    container.addClass('html-viewer-container');

    try {
      const id = ++this.renderId;
      const rawHtml = await this.app.vault.read(this.file);
      if (id !== this.renderId) return;

      if (!rawHtml || rawHtml.replace(/\0/g, '').trim() === '') {
        throw new Error('HTML file is empty');
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Malformed or invalid HTML structure');
      }

      const currentFolder = this.file.parent ? this.file.parent.path : '';
      
      const result = await resolveHtmlAssets({
        rawHtml,
        currentFileFolderPath: currentFolder,
        getResourcePathFn: (path: string) => {
          const tfile = this.app.vault.getAbstractFileByPath(path);
          if (tfile instanceof TFile) {
            return this.app.vault.getResourcePath(tfile);
          }
          return path;
        },
        readVaultFileFn: async (path: string) => {
          const tfile = this.app.vault.getAbstractFileByPath(path);
          if (tfile instanceof TFile) {
            return await this.app.vault.read(tfile);
          }
          throw new Error(`File not found: ${path}`);
        }
      });

      this.vaultWatcher.setDependencies(result.assetPaths);
      this.vaultWatcher.updateDependencies(this.file.path, result.assetPaths, this.reloadCallback);

      if (this.mode === 'preview') {
        const iframeEl = container.createEl('iframe', {
          cls: 'html-viewer-iframe',
          attr: { sandbox: 'allow-scripts allow-forms allow-same-origin allow-modals' }
        });
        iframeEl.srcdoc = result.transformedHtml;
        this.ipcBridge.setIframe(iframeEl);
      } else {
        this.ipcBridge.setIframe(null);
        const sourceEl = container.createEl('pre', { cls: 'html-viewer-source-container' });
        sourceEl.textContent = rawHtml;
      }
    } catch (err: any) {
      this.ipcBridge.setIframe(null);
      container.empty();
      container.addClass('html-viewer-container');
      const errorContainer = container.createDiv({ cls: 'html-viewer-error-container' });
      const card = errorContainer.createDiv({ cls: 'html-viewer-error-card' });
      const header = card.createDiv({ cls: 'html-viewer-error-header' });
      header.createDiv({ cls: 'html-viewer-error-title', text: 'Error Loading HTML File' });
      const errorMessage = err ? (err.message || String(err)) : 'Unknown error';
      card.createDiv({ cls: 'html-viewer-error-message', text: errorMessage });
    }
  }
}

