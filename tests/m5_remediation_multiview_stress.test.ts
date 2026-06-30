import { VaultWatcher } from '../src/watcher/VaultWatcher';

describe('Milestone 5 Multi-View Dependency Remediation Stress Harness', () => {
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Harness 1: Multiple views watching same HTML file with different asset sets', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    const view1Cb = jest.fn();
    const view2Cb = jest.fn();
    const view3Cb = jest.fn();

    const sharedHtml = 'dashboard/index.html';

    // View 1 registers with assetA.css
    watcher.registerView(sharedHtml, view1Cb, ['assets/assetA.css']);
    // View 2 registers with assetB.js
    watcher.registerView(sharedHtml, view2Cb, ['assets/assetB.js']);
    // View 3 registers with assetC.svg
    watcher.registerView(sharedHtml, view3Cb, ['assets/assetC.svg']);

    // Verify all combined dependencies are preserved without overwriting
    const combinedDeps = watcher.getDependencies(sharedHtml);
    expect(combinedDeps.sort()).toEqual(['assets/assetA.css', 'assets/assetB.js', 'assets/assetC.svg'].sort());

    // Modify assetA.css -> only view1Cb triggered
    modifyCallback({ path: 'assets/assetA.css' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
    expect(view2Cb).not.toHaveBeenCalled();
    expect(view3Cb).not.toHaveBeenCalled();

    // Modify assetB.js -> only view2Cb triggered
    modifyCallback({ path: 'assets/assetB.js' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
    expect(view2Cb).toHaveBeenCalledTimes(1);
    expect(view3Cb).not.toHaveBeenCalled();

    // Modify assetC.svg -> only view3Cb triggered
    modifyCallback({ path: 'assets/assetC.svg' });
    expect(view1Cb).toHaveBeenCalledTimes(1);
    expect(view2Cb).toHaveBeenCalledTimes(1);
    expect(view3Cb).toHaveBeenCalledTimes(1);

    // Modify sharedHtml itself -> all views triggered
    modifyCallback({ path: sharedHtml });
    expect(view1Cb).toHaveBeenCalledTimes(2);
    expect(view2Cb).toHaveBeenCalledTimes(2);
    expect(view3Cb).toHaveBeenCalledTimes(2);
  });

  test('Harness 2: Closing one view tab while keeping another view tab for the same file open', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    const tab1Cb = jest.fn();
    const tab2Cb = jest.fn();
    const sharedHtml = 'workspace/project.html';

    watcher.registerView(sharedHtml, tab1Cb, ['styles/tab1.css']);
    watcher.registerView(sharedHtml, tab2Cb, ['styles/tab2.css']);

    // Close Tab 1
    watcher.unregisterView(sharedHtml, tab1Cb);

    // Verify tab1.css modification no longer triggers tab1Cb
    modifyCallback({ path: 'styles/tab1.css' });
    expect(tab1Cb).not.toHaveBeenCalled();
    expect(tab2Cb).not.toHaveBeenCalled();

    // Verify tab2.css modification STILL triggers tab2Cb
    modifyCallback({ path: 'styles/tab2.css' });
    expect(tab1Cb).not.toHaveBeenCalled();
    expect(tab2Cb).toHaveBeenCalledTimes(1);

    // Verify project.html modification STILL triggers remaining Tab 2
    modifyCallback({ path: sharedHtml });
    expect(tab1Cb).not.toHaveBeenCalled();
    expect(tab2Cb).toHaveBeenCalledTimes(2);
  });

  test('Harness 3: Stress test with 100 concurrent view tabs watching the same HTML file', () => {
    const watcher = new VaultWatcher(mockVault);
    watcher.register();

    const count = 100;
    const callbacks: jest.Mock[] = [];
    const sharedHtml = 'stress/multi.html';

    for (let i = 0; i < count; i++) {
      const cb = jest.fn();
      callbacks.push(cb);
      watcher.registerView(sharedHtml, cb, [`assets/dep_${i}.css`]);
    }

    expect(watcher.getDependencies(sharedHtml).length).toBe(count);

    // Trigger modification for dep_42.css
    modifyCallback({ path: 'assets/dep_42.css' });
    expect(callbacks[42]).toHaveBeenCalledTimes(1);

    // Ensure no other callbacks were triggered
    callbacks.forEach((cb, idx) => {
      if (idx !== 42) {
        expect(cb).not.toHaveBeenCalled();
      }
    });

    // Clear mock histories to prevent index 42 from failing the next assertion
    callbacks.forEach(cb => cb.mockClear());


    // Unregister 50 tabs
    for (let i = 0; i < 50; i++) {
      watcher.unregisterView(sharedHtml, callbacks[i]);
    }

    expect(watcher.getDependencies(sharedHtml).length).toBe(50);

    // Modify sharedHtml -> remaining 50 callbacks triggered
    modifyCallback({ path: sharedHtml });
    for (let i = 0; i < 50; i++) {
      expect(callbacks[i]).not.toHaveBeenCalled();
    }
    for (let i = 50; i < 100; i++) {
      expect(callbacks[i]).toHaveBeenCalledTimes(1);
    }
  });
});
