import { VaultWatcher } from '../src/watcher/VaultWatcher';

describe('VaultWatcher Unit Tests', () => {
  let mockVault: any;
  let modifyCallback: (file: any) => void;

  beforeEach(() => {
    modifyCallback = () => {};
    mockVault = {
      on: jest.fn().mockImplementation((event: string, callback: (file: any) => void) => {
        if (event === 'modify') {
          modifyCallback = callback;
        }
        return { id: 'modify-listener' };
      }),
      offref: jest.fn()
    };
  });

  test('should subscribe to vault modify event on register and cleanup on unregister', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    expect(mockVault.on).toHaveBeenCalledWith('modify', expect.any(Function));

    watcher.unregister();
    expect(mockVault.offref).toHaveBeenCalledWith({ id: 'modify-listener' });
  });

  test('should trigger reload when tracked HTML file is modified', () => {
    const reloadSpy = jest.fn();
    const getCurrentPath = () => 'docs/index.html';
    const watcher = new VaultWatcher(mockVault, getCurrentPath, reloadSpy);
    watcher.register();

    // Modify unrelated file
    modifyCallback({ path: 'docs/other.md' });
    expect(reloadSpy).not.toHaveBeenCalled();

    // Modify tracked file
    modifyCallback({ path: 'docs/index.html' });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test('should track asset dependencies and trigger reload when dependent asset is modified', () => {
    const reloadSpy = jest.fn();
    const getCurrentPath = () => 'docs/index.html';
    const watcher = new VaultWatcher(mockVault, getCurrentPath, reloadSpy);
    watcher.register();

    watcher.setDependencies(['docs/styles.css', 'docs/logo.png']);

    // Modify dependent asset
    modifyCallback({ path: 'docs/styles.css' });
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    modifyCallback({ path: 'docs/logo.png' });
    expect(reloadSpy).toHaveBeenCalledTimes(2);

    // Check getDependencies
    expect(watcher.getDependencies('docs/index.html')).toEqual(['docs/styles.css', 'docs/logo.png']);
  });

  test('should support global multi-view registration and notifications', () => {
    const globalWatcher = new VaultWatcher(mockVault);
    globalWatcher.register();

    const view1Cb = jest.fn();
    const view2Cb = jest.fn();

    globalWatcher.registerView('view1.html', view1Cb, ['style1.css']);
    globalWatcher.registerView('view2.html', view2Cb, ['style2.css']);

    // Modify style1.css -> only view1Cb triggered
    modifyCallback({ path: 'style1.css' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
    expect(view2Cb).not.toHaveBeenCalled();

    // Modify view2.html -> only view2Cb triggered
    modifyCallback({ path: 'view2.html' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
    expect(view2Cb).toHaveBeenCalledTimes(1);

    // Unregister view1
    globalWatcher.unregisterView('view1.html', view1Cb);
    modifyCallback({ path: 'style1.css' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
  });

  test('should merge dependencies across multiple views watching the same HTML file without overwriting', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    const view1Cb = jest.fn();
    const view2Cb = jest.fn();

    watcher.registerView('index.html', view1Cb, ['style1.css']);
    watcher.registerView('index.html', view2Cb, ['style2.css']);

    const deps = watcher.getDependencies('index.html');
    expect(deps.sort()).toEqual(['style1.css', 'style2.css'].sort());

    modifyCallback({ path: 'style1.css' });
    expect(view1Cb).toHaveBeenCalledTimes(1);

    modifyCallback({ path: 'style2.css' });
    expect(view2Cb).toHaveBeenCalledTimes(1);
  });

  test('should isolate subscriber callback exceptions so failure in one does not starve others', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    const faultyCb = jest.fn().mockImplementation(() => {
      throw new Error('Callback failure');
    });
    const healthyCb = jest.fn();

    watcher.registerView('page.html', faultyCb);
    watcher.registerView('page.html', healthyCb);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      modifyCallback({ path: 'page.html' });
    }).not.toThrow();

    expect(faultyCb).toHaveBeenCalledTimes(1);
    expect(healthyCb).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  test('should safely handle unregisterView without wiping all subscriber callbacks when omitted', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    const view1Cb = jest.fn();
    const view2Cb = jest.fn();

    watcher.registerView('shared.html', view1Cb, ['shared.css']);
    watcher.registerView('shared.html', view2Cb, ['shared.css']);

    watcher.unregisterView('shared.html');

    modifyCallback({ path: 'shared.html' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
    expect(view2Cb).toHaveBeenCalledTimes(1);

    watcher.unregisterView('shared.html', view1Cb);
    modifyCallback({ path: 'shared.html' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
    expect(view2Cb).toHaveBeenCalledTimes(2);
  });

  test('should fallback to trackedDependencies in getDependencies when view dependencies are empty', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.setDependencies(['global.css']);

    watcher.registerView('empty.html', jest.fn(), []);

    expect(watcher.getDependencies('empty.html')).toEqual(['global.css']);
  });

  test('should normalize paths with Windows backslashes and relative prefixes', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    const cb = jest.fn();
    watcher.registerView('.\\docs\\index.html', cb, ['./docs/style.css', '..\\docs\\app.js']);

    expect(watcher.getDependencies('docs/index.html').sort()).toEqual(['docs/style.css', 'docs/app.js'].sort());

    modifyCallback({ path: 'docs\\style.css' });
    expect(cb).toHaveBeenCalledTimes(1);

    modifyCallback({ path: './docs/app.js' });
    expect(cb).toHaveBeenCalledTimes(2);

    modifyCallback({ path: '.\\docs\\index.html' });
    expect(cb).toHaveBeenCalledTimes(3);
  });
});

