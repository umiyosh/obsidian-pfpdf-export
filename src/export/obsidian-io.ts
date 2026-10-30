import { normalizePath, requestUrl, TFile, type App } from "obsidian";
import type { LinkedFile } from "../convert/types";
import type { Download, VaultIO } from "./vault-io";

// requestUrl has no timeout of its own; an unresponsive image host must not stall the export.
const DOWNLOAD_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

function toLinked(file: TFile): LinkedFile {
  return { path: file.path, basename: file.basename, extension: file.extension.toLowerCase() };
}

function joinRelative(sourcePath: string, linkpath: string): string {
  const parts = sourcePath.split("/").slice(0, -1);
  for (const seg of linkpath.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return normalizePath(parts.join("/"));
}

export class ObsidianVaultIO implements VaultIO {
  constructor(private readonly app: App) {}

  resolve(linkpath: string, sourcePath: string): LinkedFile | null {
    const linked = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    if (linked) return toLinked(linked);
    // "../" paths in Markdown links are not always resolved by the link cache.
    const relative = this.file(joinRelative(sourcePath, linkpath));
    return relative ? toLinked(relative) : null;
  }

  readText(path: string): Promise<string> {
    return this.app.vault.cachedRead(this.requireFile(path));
  }

  readBinary(path: string): Promise<ArrayBuffer> {
    return this.app.vault.readBinary(this.requireFile(path));
  }

  async download(url: string): Promise<Download | null> {
    try {
      // requestUrl is not subject to CORS, unlike fetch from the renderer.
      const res = await withTimeout(requestUrl({ url, throw: false }), DOWNLOAD_TIMEOUT_MS);
      if (!res || res.status < 200 || res.status >= 300) return null;
      return { data: res.arrayBuffer, contentType: res.headers["content-type"] };
    } catch {
      return null;
    }
  }

  private file(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private requireFile(path: string): TFile {
    const file = this.file(path);
    if (!file) throw new Error(`File not found in vault: ${path}`);
    return file;
  }
}
