import type { LinkedFile } from "../convert/types";

export interface Download {
  data: ArrayBuffer;
  contentType?: string;
}

/** The vault operations an export needs, so the pipeline runs both inside Obsidian and in tests. */
export interface VaultIO {
  resolve(linkpath: string, sourcePath: string): LinkedFile | null;
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  /** Returns null when the URL cannot be fetched. */
  download(url: string): Promise<Download | null>;
}
