import { TFile, Vault } from 'obsidian';

const mimeTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  js: 'text/javascript', mjs: 'text/javascript', vtt: 'text/vtt', css: 'text/css'
};

/** Embed assets through the vault API; opaque frames never receive filesystem privileges. */
export class VaultResources {
  private totalBytes = 0;
  constructor(private vault: Vault) {}

  private file(path: string): TFile {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
    if (file.stat?.size > 32 * 1024 * 1024) throw new Error(`Asset exceeds 32 MB: ${path}`);
    return file;
  }

  public async readText(path: string): Promise<string> {
    const text = await this.vault.read(this.file(path));
    this.reserve(text.length * 2);
    return text;
  }

  public async dataUrl(path: string): Promise<string> {
    const file = this.file(path);
    const bytes = new Uint8Array(await this.vault.readBinary(file));
    this.reserve(bytes.byteLength);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    const extension = path.split('.').pop()?.toLowerCase() || '';
    return `data:${mimeTypes[extension] || 'application/octet-stream'};base64,${btoa(binary)}`;
  }

  private reserve(bytes: number): void {
    this.totalBytes += bytes;
    if (this.totalBytes > 100 * 1024 * 1024) throw new Error('Preview assets exceed the 100 MB limit');
  }
}
