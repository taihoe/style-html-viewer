import { getClickInterceptorScript } from '../src/ipc/IpcBridge';
import { cleanupPreviewRuntime, installPreviewRuntime } from './previewRuntimeHarness';

describe('Isolated preview command validation', () => {
  const token = 'preview-token';
  const command = (data: unknown, source: Window = window) =>
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  const find = { type: 'html-viewer-command', token, action: 'find', query: 'needle' };
  let originalScroll: PropertyDescriptor | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<h1 data-html-viewer-heading="title">Title</h1><p>Needle alpha needle beta</p>';
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
    originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: jest.fn() });
    installPreviewRuntime(token);
  });

  afterEach(() => {
    cleanupPreviewRuntime();
    document.body.replaceChildren();
    jest.restoreAllMocks();
    if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  test('ignores malformed commands, wrong tokens and messages from another window', () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    const errors = jest.fn();
    window.addEventListener('error', errors);
    try {
      command(find, {} as Window);
      for (const data of [
        null, undefined, 1, 'find', [], {},
        { ...find, token: 'wrong' }, { ...find, query: 42 },
        { ...find, type: 'other' }, { ...find, action: 'heading', id: {} },
        { ...find, action: 'print', token: null }
      ]) command(data);
      expect(document.querySelector('mark')).toBeNull();
      expect(print).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally { window.removeEventListener('error', errors); }
  });

  test('search and navigation work without Obsidian DOM helpers or stylesheet adoption', () => {
    command(find);
    const marks = document.querySelectorAll('mark');
    expect([...marks].map(mark => mark.textContent)).toEqual(['Needle', 'needle']);
    expect(marks[0].classList.contains('html-viewer-current-match')).toBe(true);
    command({ ...find, action: 'next', direction: {} });
    expect(marks[0].classList.contains('html-viewer-current-match')).toBe(true);
    command({ ...find, action: 'next', direction: 1 });
    expect(marks[1].classList.contains('html-viewer-current-match')).toBe(true);
    command({ ...find, action: 'heading', id: 'title' });
    expect(document.querySelector('h1')?.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    command({ ...find, query: '' });
    expect(document.querySelector('mark')).toBeNull();
    expect(document.querySelector('p')?.textContent).toBe('Needle alpha needle beta');
  });

  test('serialized arguments cannot break out of the nonce-authorized script element', () => {
    const script = getClickInterceptorScript('</script><img src=x onerror=alert(1)>');
    expect(script).not.toMatch(/<\/script/i);
    const doc = new DOMParser().parseFromString(`<script>${script}</script>`, 'text/html');
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(doc.querySelector('img')).toBeNull();
  });
});
