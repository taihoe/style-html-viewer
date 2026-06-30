if (typeof HTMLElement !== 'undefined') {
  if (!HTMLElement.prototype.empty) {
    HTMLElement.prototype.empty = function() {
      this.innerHTML = '';
    };
  }
  if (!HTMLElement.prototype.addClass) {
    HTMLElement.prototype.addClass = function(...classes) {
      this.classList.add(...classes);
    };
  }
  if (!HTMLElement.prototype.removeClass) {
    HTMLElement.prototype.removeClass = function(...classes) {
      this.classList.remove(...classes);
    };
  }
  if (!HTMLElement.prototype.createEl) {
    HTMLElement.prototype.createEl = function(tag, o) {
      const el = document.createElement(tag);
      if (o) {
        if (o.cls) {
          if (Array.isArray(o.cls)) {
            el.classList.add(...o.cls);
          } else {
            el.classList.add(o.cls);
          }
        }
        if (o.attr) {
          for (const key of Object.keys(o.attr)) {
            el.setAttribute(key, o.attr[key]);
          }
        }
        if (o.text) {
          el.textContent = o.text;
        }
      }
      this.appendChild(el);
      return el;
    };
  }
  if (!HTMLElement.prototype.createDiv) {
    HTMLElement.prototype.createDiv = function(o) {
      return this.createEl('div', o);
    };
  }
}

class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf ? leaf.app : null;
    this.contentEl = document.createElement('div');
    this.containerEl = document.createElement('div');
    this.actions = [];
  }
  getViewType() { return ''; }
  getDisplayText() { return ''; }
  onOpen() {}
  onClose() {}
  onLoadFile(file) {}
  addAction(icon, title, callback) {
    this.actions.push({ icon, title, callback });
    const actionEl = document.createElement('div');
    actionEl.setAttribute('aria-label', title);
    actionEl.onclick = callback;
    return actionEl;
  }
}

class WorkspaceLeaf {}
class TFile {}
class Plugin {
  registerView() {}
  registerExtensions() {}
  addCommand() {}
}

class FileView extends ItemView {
  constructor(leaf) {
    super(leaf);
    this.file = null;
    this.allowNoFile = false;
    this.navigation = true;
  }
  async onLoadFile(file) {
    this.file = file;
  }
  async onUnloadFile(file) {
    this.file = null;
  }
  async onRename(file) {
    this.file = file;
  }
  canAcceptExtension(extension) {
    return extension === 'html';
  }
}

module.exports = {
  ItemView,
  FileView,
  WorkspaceLeaf,
  TFile,
  Plugin
};
