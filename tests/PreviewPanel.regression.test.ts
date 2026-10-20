import { App, TFile, Vault } from 'obsidian';
import { PreviewPanel } from '../src/preview/PreviewPanel';
import { VaultWatcher } from '../src/watcher/VaultWatcher';

function makeFile(path: string): TFile {
  return Object.assign(new TFile(), { path, basename: path.split('/').pop() || path, stat: { size: 1 } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const contents = new Map<string, string>();
  const files = new Map<string, TFile>();
  const listeners = new Map<string, Set<(file: TFile, oldPath?: string) => void>>();
  const read = jest.fn(async (file: TFile): Promise<string> => {
    const text = contents.get(file.path);
    if (text === undefined) throw new Error(`Missing ${file.path}`);
    return text;
  });
  const vault = {
    read, readBinary: jest.fn(async () => new ArrayBuffer(0)),
    getAbstractFileByPath: (path: string) => files.get(path),
    on: (name: string, callback: (file: TFile, oldPath?: string) => void) => {
      const callbacks = listeners.get(name) || new Set(); callbacks.add(callback); listeners.set(name, callbacks);
      return { name, callback };
    },
    offref: (ref: { name: string; callback: (file: TFile) => void }) => listeners.get(ref.name)?.delete(ref.callback)
  };
  const watcher = new VaultWatcher(vault as unknown as Vault);
  watcher.register();
  const container = document.createElement('div');
  document.body.append(container);
  const preferences = { enabled: () => false, setEnabled: jest.fn(async () => {}) };
  const panel = new PreviewPanel({ vault, workspace: {} } as unknown as App, container, watcher, preferences);
  return {
    panel, container, watcher, vault, contents, files, listeners, preferences,
    add(path: string, text: string) { const file = makeFile(path); files.set(path, file); contents.set(path, text); return file; },
    emit(event: string, file: TFile, oldPath?: string) { listeners.get(event)?.forEach(callback => callback(file, oldPath)); },
    close() { panel.dispose(); watcher.unregister(); container.remove(); }
  };
}

describe('Preview lifecycle regressions', () => {
  test('late stylesheet resolution cannot append an old frame or publish old dependencies', async () => {
    const f = fixture();
    const old = f.add('old.html', '<link rel="stylesheet" href="slow.css"><p>Old</p>');
    f.add('slow.css', '');
    const next = f.add('new.html', '<h1>New</h1>');
    const css = deferred<string>();
    const started = deferred<void>();
    f.vault.read.mockImplementation(async file => {
      if (file.path === 'slow.css') { started.resolve(); return css.promise; }
      return f.contents.get(file.path)!;
    });
    const oldLoad = f.panel.load(old);
    await started.promise;
    await f.panel.load(next);
    css.resolve('p{color:red}');
    await oldLoad;
    expect(f.container.querySelectorAll('iframe')).toHaveLength(1);
    expect(f.container.querySelector('iframe')!.srcdoc).toContain('<h1');
    expect(f.watcher.getDependencies('new.html')).toEqual([]);
    f.close();
  });

  test('a stale read rejection does not replace a newer successful preview', async () => {
    const f = fixture();
    const old = f.add('old.html', 'Old');
    const next = f.add('new.html', 'New');
    const pending = deferred<string>();
    f.vault.read.mockImplementationOnce(() => pending.promise);
    const first = f.panel.load(old);
    await f.panel.load(next);
    pending.reject(new Error('Old error'));
    await first;
    expect(f.container.querySelector('iframe')!.srcdoc).toContain('New');
    expect(f.container.querySelector('.html-viewer-error-card')).toBeNull();
    f.close();
  });

  test('closing during a read never creates a frame or registers dependencies afterward', async () => {
    const f = fixture();
    const file = f.add('close.html', 'Close');
    const pending = deferred<string>();
    f.vault.read.mockImplementationOnce(() => pending.promise);
    const load = f.panel.load(file);
    f.panel.dispose();
    pending.resolve('<img src="late.png">');
    await load;
    expect(f.container.querySelector('iframe')).toBeNull();
    expect(f.watcher.getDependencies('close.html')).toEqual([]);
    f.close();
  });

  test('source mode does not read assets and can inspect an empty document', async () => {
    const f = fixture();
    const file = f.add('source.html', '<link rel="stylesheet" href="missing.css">');
    f.panel.toggleSource();
    await f.panel.load(file);
    expect(f.vault.read).toHaveBeenCalledTimes(1);
    expect(f.container.querySelector('pre')?.textContent).toContain('missing.css');
    f.contents.set(file.path, '');
    await f.panel.load(file);
    expect(f.container.querySelector('pre')).not.toBeNull();
    f.close();
  });

  test('rename migrates subscriptions and close removes both old and new registrations', async () => {
    jest.useFakeTimers();
    const f = fixture();
    try {
      const file = f.add('old/page.html', '<p>Hello</p>');
      await f.panel.load(file);
      f.contents.set('new/page.html', '<p>Moved</p>');
      file.path = 'new/page.html';
      f.emit('rename', makeFile('new'), 'old');
      await jest.advanceTimersByTimeAsync(100);
      expect(f.container.querySelector('iframe')?.srcdoc).toContain('Moved');
      f.vault.read.mockClear();
      f.emit('modify', file);
      await jest.advanceTimersByTimeAsync(100);
      expect(f.vault.read).toHaveBeenCalledTimes(1);
      f.panel.dispose();
      f.vault.read.mockClear();
      f.emit('modify', file);
      f.emit('modify', makeFile('old/page.html'));
      await jest.advanceTimersByTimeAsync(100);
      expect(f.vault.read).not.toHaveBeenCalled();
    } finally { f.close(); jest.useRealTimers(); }
  });

  test('creating and deleting a missing stylesheet refreshes diagnostics and dependencies', async () => {
    jest.useFakeTimers();
    const f = fixture();
    try {
      const file = f.add('page.html', '<link rel="stylesheet" href="theme.css">');
      await f.panel.load(file);
      expect(f.watcher.getDependencies('page.html')).toEqual(['theme.css']);
      expect(f.container.querySelector('summary')?.textContent).toContain('Issues (1)');
      const css = f.add('theme.css', 'body{color:green}');
      f.emit('create', css);
      await jest.advanceTimersByTimeAsync(100);
      expect(f.container.querySelector('summary')?.textContent).toContain('Issues (0)');
      f.files.delete('theme.css');
      f.emit('delete', css);
      await jest.advanceTimersByTimeAsync(100);
      expect(f.container.querySelector('summary')?.textContent).toContain('Issues (1)');
    } finally { f.close(); jest.useRealTimers(); }
  });

  test('a burst of modifications produces one render and no reload after disposal', async () => {
    jest.useFakeTimers();
    const f = fixture();
    try {
      const file = f.add('page.html', 'Hello');
      await f.panel.load(file);
      f.vault.read.mockClear();
      for (let i = 0; i < 50; i++) f.emit('modify', file);
      await jest.advanceTimersByTimeAsync(100);
      expect(f.vault.read).toHaveBeenCalledTimes(1);
      f.emit('modify', file);
      f.panel.dispose();
      await jest.advanceTimersByTimeAsync(100);
      expect(f.vault.read).toHaveBeenCalledTimes(1);
    } finally { f.close(); jest.useRealTimers(); }
  });
});
