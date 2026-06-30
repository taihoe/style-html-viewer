import { VaultWatcher } from '../src/watcher/VaultWatcher';

describe('Milestone 5 Remediation Empirical Stress Test Suite', () => {
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

  describe('Dynamic Stress Harness 1: Exception Isolation under Heavy Load', () => {
    test('verifies failure in interspersed throwing subscribers does not starve healthy callbacks across 50 subscribers', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const watcher = new VaultWatcher(mockVault);
      watcher.register();

      const subscriberCounts = new Map<string, number>();
      const totalSubscribers = 50;
      const throwingIndices = new Set([0, 5, 12, 19, 25, 33, 41, 49]); // 8 throwing callbacks

      for (let i = 0; i < totalSubscribers; i++) {
        const id = `sub_${i}`;
        subscriberCounts.set(id, 0);

        if (throwingIndices.has(i)) {
          watcher.registerView('shared_stress.html', () => {
            subscriberCounts.set(id, subscriberCounts.get(id)! + 1);
            throw new Error(`Simulated unhandled exception from subscriber ${i}`);
          });
        } else {
          watcher.registerView('shared_stress.html', () => {
            subscriberCounts.set(id, subscriberCounts.get(id)! + 1);
          });
        }
      }

      // Dispatch vault modify event
      expect(() => {
        modifyCallback({ path: 'shared_stress.html' });
      }).not.toThrow();

      // Verify ALL 50 callbacks were invoked exactly once
      for (let i = 0; i < totalSubscribers; i++) {
        expect(subscriberCounts.get(`sub_${i}`)).toBe(1);
      }

      // Verify console.error was called exactly 8 times (once per throwing subscriber)
      expect(consoleSpy).toHaveBeenCalledTimes(throwingIndices.size);
    });

    test('verifies legacy onReload callback executes regardless of throwing multi-view subscribers', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const legacyReloadCb = jest.fn();
      const watcher = new VaultWatcher(mockVault, () => 'app/main.html', legacyReloadCb);
      watcher.register();

      watcher.registerView('app/main.html', () => {
        throw new TypeError('Faulty multi-view callback');
      });

      modifyCallback({ path: 'app/main.html' });

      expect(legacyReloadCb).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dynamic Stress Harness 2: Exhaustive Path Normalization Matrix', () => {
    test('verifies path lookups succeed with Windows backslashes, relative prefixes, and traversal paths', () => {
      const watcher = new VaultWatcher(mockVault);
      watcher.register();

      const targetCb = jest.fn();
      
      // Register view with messy Windows path and relative traversals
      // Resolves to: 'vault/pages/dashboard.html'
      const registeredViewPath = '.\\vault\\subfolder\\..\\pages\\dashboard.html';
      
      // Register dependency with mixed slashes and relative dots
      // Resolves to: 'vault/assets/theme.css'
      const registeredDepPath = './vault/assets/./theme.css';

      watcher.registerView(registeredViewPath, targetCb, [registeredDepPath]);

      // 1. Check normalized getDependencies output
      const retrievedDeps = watcher.getDependencies('vault/pages/dashboard.html');
      expect(retrievedDeps).toEqual(['vault/assets/theme.css']);

      // 2. Trigger modify event on HTML file using different messy path format
      modifyCallback({ path: 'vault\\pages\\..\\pages\\dashboard.html' });
      expect(targetCb).toHaveBeenCalledTimes(1);

      // 3. Trigger modify event on Asset file using Windows backslashes and ./ prefix
      modifyCallback({ path: '.\\vault\\assets\\theme.css' });
      expect(targetCb).toHaveBeenCalledTimes(2);

      // 4. Trigger modify event on Asset file with mixed relative traversals
      modifyCallback({ path: './vault/assets/sub/../theme.css' });
      expect(targetCb).toHaveBeenCalledTimes(3);
    });
  });
});
