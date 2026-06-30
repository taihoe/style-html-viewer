import { VaultWatcher } from '../src/watcher/VaultWatcher';

describe('Milestone 5 VaultWatcher Stress & Remediation Verification Test Suite', () => {
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
    jest.restoreAllMocks();
  });

  describe('Dimension 1: Rapid Consecutive Vault Modification Stress Tests', () => {
    test('handles 1,000 rapid consecutive modifications without dropping events', () => {
      const reloadSpy = jest.fn();
      const getCurrentPath = () => 'docs/index.html';
      const watcher = new VaultWatcher(mockVault, getCurrentPath, reloadSpy);
      watcher.register();

      const iterations = 1000;
      const startTime = Date.now();
      for (let i = 0; i < iterations; i++) {
        modifyCallback({ path: 'docs/index.html' });
      }
      const duration = Date.now() - startTime;

      expect(reloadSpy).toHaveBeenCalledTimes(iterations);
      expect(duration).toBeLessThan(1000); // Should process quickly
    });

    test('REMEDIATION VERIFICATION: Subscriber exception does NOT halt notification loop for remaining views', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const globalWatcher = new VaultWatcher(mockVault);
      globalWatcher.register();

      const faultyViewCb = jest.fn().mockImplementation(() => {
        throw new Error('DOM manipulation error in View 1');
      });
      const validViewCb = jest.fn();

      globalWatcher.registerView('shared.html', faultyViewCb);
      globalWatcher.registerView('shared.html', validViewCb);

      // Triggering modify event executes callbacks safely without throwing
      expect(() => {
        modifyCallback({ path: 'shared.html' });
      }).not.toThrow();

      // faultyViewCb was called and threw, and validViewCb WAS called successfully due to try-catch isolation
      expect(faultyViewCb).toHaveBeenCalledTimes(1);
      expect(validViewCb).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dimension 2: Deeply Nested Asset Dependencies & Path Normalization', () => {
    test('tracks deeply nested asset dependencies across multiple directory levels', () => {
      const reloadSpy = jest.fn();
      const watcher = new VaultWatcher(mockVault, () => 'index.html', reloadSpy);
      watcher.register();

      const deepAssets = [
        'assets/css/themes/dark/v2/main.min.css',
        'assets/js/vendor/components/graph/chart.js',
        'static/media/videos/tutorials/intro.mp4',
        'fonts/roboto/woff2/Roboto-Bold.woff2'
      ];
      watcher.setDependencies(deepAssets);

      deepAssets.forEach((asset, idx) => {
        modifyCallback({ path: asset });
        expect(reloadSpy).toHaveBeenCalledTimes(idx + 1);
      });
    });

    test('REMEDIATION VERIFICATION: Path normalization matches lookups with relative dots, slashes, and backslashes', () => {
      const reloadSpy = jest.fn();
      const watcher = new VaultWatcher(mockVault, () => 'index.html', reloadSpy);
      watcher.register();

      watcher.setDependencies(['assets/style.css']);

      // Modified event with leading slash, ./ prefix, or backslashes
      modifyCallback({ path: './assets/style.css' });
      modifyCallback({ path: '/assets/style.css' });
      modifyCallback({ path: 'assets\\style.css' });

      // All 3 events match due to proper path normalization
      expect(reloadSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Dimension 3: Dynamic Multi-View Registration & Dependency Isolation', () => {
    test('REMEDIATION VERIFICATION: Second view watching same HTML file does not overwrite first view dependency map', () => {
      const globalWatcher = new VaultWatcher(mockVault);
      globalWatcher.register();

      const viewACb = jest.fn();
      const viewBCb = jest.fn();

      // View A registers for dashboard.html with its dependencies
      globalWatcher.registerView('dashboard.html', viewACb, ['assets/viewA.css']);

      // View B registers for the SAME dashboard.html with different dependencies
      globalWatcher.registerView('dashboard.html', viewBCb, ['assets/viewB.css']);

      // Modifying viewA.css triggers View A but NOT View B
      modifyCallback({ path: 'assets/viewA.css' });
      expect(viewACb).toHaveBeenCalledTimes(1);
      expect(viewBCb).not.toHaveBeenCalled();

      // Modifying viewB.css triggers View B but NOT View A
      modifyCallback({ path: 'assets/viewB.css' });
      expect(viewACb).toHaveBeenCalledTimes(1);
      expect(viewBCb).toHaveBeenCalledTimes(1);
    });

    test('REMEDIATION VERIFICATION: Parameterless unregisterView safely retains subscriber callbacks', () => {
      const globalWatcher = new VaultWatcher(mockVault);
      globalWatcher.register();

      const viewACb = jest.fn();
      const viewBCb = jest.fn();

      globalWatcher.registerView('article.html', viewACb);
      globalWatcher.registerView('article.html', viewBCb);

      // Parameterless unregisterView is called
      globalWatcher.unregisterView('article.html');

      // article.html is modified
      modifyCallback({ path: 'article.html' });

      // Both View A and View B remain subscribed
      expect(viewACb).toHaveBeenCalledTimes(1);
      expect(viewBCb).toHaveBeenCalledTimes(1);
    });

    test('REMEDIATION VERIFICATION: Default empty dependencies array in registerView falls back to trackedDependencies', () => {
      const globalWatcher = new VaultWatcher(mockVault);
      globalWatcher.setDependencies(['global.css']);
      globalWatcher.register();

      const viewCb = jest.fn();
      globalWatcher.registerView('page.html', viewCb); // dependencies defaults to []

      // getDependencies returns fallback global trackedDependencies
      expect(globalWatcher.getDependencies('page.html')).toEqual(['global.css']);
    });
  });
});
