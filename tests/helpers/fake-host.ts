import type { ConvertHost, LinkedFile } from "../../src/convert/types";

function toLinked(path: string): LinkedFile {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return {
    path,
    basename: dot < 0 ? name : name.slice(0, dot),
    extension: dot < 0 ? "" : name.slice(dot + 1).toLowerCase(),
  };
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function joinRelative(dir: string, rel: string): string {
  const parts = dir ? dir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

/** In-memory vault that resolves links the way Obsidian does for the cases under test. */
export class FakeHost implements ConvertHost {
  readonly localAssets: string[] = [];
  readonly remoteAssets: string[] = [];
  readonly warnings: string[] = [];

  constructor(
    private readonly files: Record<string, string>,
    private readonly failingUrls: string[] = []
  ) {}

  resolve(linkpath: string, sourcePath: string): LinkedFile | null {
    const paths = Object.keys(this.files);
    const relative = joinRelative(dirname(sourcePath), linkpath);
    const candidates = [linkpath, `${linkpath}.md`, relative, `${relative}.md`];
    const exact = candidates.find((c) => paths.includes(c));
    if (exact) return toLinked(exact);
    const byName = paths.find((p) => p.endsWith(`/${linkpath}`) || p.endsWith(`/${linkpath}.md`));
    return byName ? toLinked(byName) : null;
  }

  readNote(file: LinkedFile): Promise<string> {
    return Promise.resolve(this.files[file.path] ?? "");
  }

  addLocalAsset(file: LinkedFile): Promise<string> {
    if (!this.localAssets.includes(file.path)) this.localAssets.push(file.path);
    return Promise.resolve(`assets/${this.localAssets.indexOf(file.path)}.${file.extension}`);
  }

  addRemoteAsset(url: string): Promise<string | null> {
    if (this.failingUrls.includes(url)) return Promise.resolve(null);
    this.remoteAssets.push(url);
    return Promise.resolve(`assets/remote-${this.remoteAssets.length - 1}.png`);
  }

  warn(message: string): void {
    this.warnings.push(message);
  }
}
