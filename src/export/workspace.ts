import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConvertHost, LinkedFile } from "../convert/types";
import type { VaultIO } from "./vault-io";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const SIGNATURES: Array<{ ext: string; offset: number; bytes: string }> = [
  { ext: "png", offset: 0, bytes: "\x89PNG" },
  { ext: "jpg", offset: 0, bytes: "\xff\xd8\xff" },
  { ext: "gif", offset: 0, bytes: "GIF8" },
  { ext: "webp", offset: 8, bytes: "WEBP" },
  { ext: "avif", offset: 4, bytes: "ftypavif" },
  { ext: "bmp", offset: 0, bytes: "BM" },
];

/**
 * Decides the image format from the bytes first, because hosts often send the wrong
 * Content-Type (GitHub serves raw SVG as text/plain), and an HTML error page must not be
 * mistaken for an image.
 */
export function imageExtension(data: ArrayBuffer, contentType: string | undefined): string | null {
  const head = new Uint8Array(data.slice(0, 512));
  const latin1 = String.fromCharCode(...head);
  const signature = SIGNATURES.find((s) => latin1.startsWith(s.bytes, s.offset));
  if (signature) return signature.ext;
  const textHead = new TextDecoder()
    .decode(head)
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (/^<svg[\s>]/.test(textHead) || (textHead.startsWith("<?xml") && textHead.includes("<svg"))) {
    return "svg";
  }
  const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return CONTENT_TYPE_EXTENSIONS[type] ?? null;
}

/** ASCII-only names keep the generated Markdown free of quoting and encoding concerns. */
export function assetFileName(index: number, stem: string, extension: string): string {
  const safe = stem.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
  return `assets/${String(index).padStart(3, "0")}-${safe || "file"}.${extension}`;
}

/** Copies the files a note references into the work directory that pfpdf reads from. */
export class WorkspaceHost implements ConvertHost {
  readonly warnings: string[] = [];
  private readonly copied = new Map<string, string>();
  private readonly downloaded = new Map<string, string | null>();

  constructor(
    private readonly io: VaultIO,
    private readonly workDir: string
  ) {}

  resolve(linkpath: string, sourcePath: string): LinkedFile | null {
    return this.io.resolve(linkpath, sourcePath);
  }

  readNote(file: LinkedFile): Promise<string> {
    return this.io.readText(file.path);
  }

  async addLocalAsset(file: LinkedFile): Promise<string> {
    const known = this.copied.get(file.path);
    if (known) return known;
    const name = this.nextName(file.basename, file.extension);
    this.copied.set(file.path, name);
    await this.write(name, await this.io.readBinary(file.path));
    return name;
  }

  async addRemoteAsset(url: string): Promise<string | null> {
    if (this.downloaded.has(url)) return this.downloaded.get(url) ?? null;
    const result = await this.io.download(url);
    const ext = result ? imageExtension(result.data, result.contentType) : null;
    const name = result && ext ? this.nextName("remote", ext) : null;
    this.downloaded.set(url, name);
    if (result && name) await this.write(name, result.data);
    return name;
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  private nextName(stem: string, extension: string): string {
    return assetFileName(this.copied.size + this.downloaded.size, stem, extension);
  }

  private write(name: string, data: ArrayBuffer): Promise<void> {
    return writeFile(join(this.workDir, name), new Uint8Array(data));
  }
}
