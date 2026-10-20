import { getClickInterceptorScript } from '../src/ipc/IpcBridge';

const cleanupCallbacks: Array<() => void> = [];

/**
 * Routing seam for the legacy click stress tests. jsdom cannot generate trusted input;
 * this harness supplies it only to the captured click listener. The browser suite tests
 * real input and sandbox enforcement without this substitution.
 */
export function installPreviewRuntime(): void {
  const originalDocumentAdd = document.addEventListener.bind(document);
  const originalWindowAdd = window.addEventListener.bind(window);
  const docSpy = jest.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    const wrapped: EventListener = event => {
      const input = type === 'click' ? new Proxy(event, {
        get(target, key) {
          if (key === 'isTrusted') return true;
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      }) : event;
      if (typeof listener === 'function') listener.call(document, input);
      else listener.handleEvent(input);
    };
    originalDocumentAdd(type, wrapped, options);
    cleanupCallbacks.push(() => document.removeEventListener(type, wrapped, options));
  });
  const winSpy = jest.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    originalWindowAdd(type, listener, options);
    cleanupCallbacks.push(() => window.removeEventListener(type, listener, options));
  });
  try { eval(getClickInterceptorScript()); }
  finally { docSpy.mockRestore(); winSpy.mockRestore(); }
}

export function cleanupPreviewRuntime(): void {
  cleanupCallbacks.splice(0).forEach(cleanup => cleanup());
}
