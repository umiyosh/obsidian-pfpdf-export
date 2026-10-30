export interface LinkedFile {
  /** Vault-relative path. */
  path: string;
  basename: string;
  /** Lowercase extension without the dot. */
  extension: string;
}

export interface ConvertHost {
  resolve(linkpath: string, sourcePath: string): LinkedFile | null;
  readNote(file: LinkedFile): Promise<string>;
  /** Copies a vault file next to the generated Markdown and returns its relative path. */
  addLocalAsset(file: LinkedFile): Promise<string>;
  /** Downloads a remote image and returns its relative path, or null when it could not be fetched. */
  addRemoteAsset(url: string): Promise<string | null>;
  warn(message: string): void;
}
