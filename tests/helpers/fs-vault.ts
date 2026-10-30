import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, relative } from "node:path";
import type { LinkedFile } from "../../src/convert/types";
import type { Download, VaultIO } from "../../src/export/vault-io";

const FIXTURE = join(import.meta.dirname, "../fixtures/vault");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function toLinked(path: string): LinkedFile {
  const parsed = posix.parse(path);
  return { path, basename: parsed.name, extension: parsed.ext.slice(1).toLowerCase() };
}

/** Copies the fixture vault to a temp dir, substituting {{REMOTE}} in notes. */
export function prepareVault(remoteBase: string): string {
  const root = mkdtempSync(join(tmpdir(), "pfpdf-vault-"));
  cpSync(FIXTURE, root, { recursive: true });
  for (const file of walk(root).filter((p) => p.endsWith(".md"))) {
    writeFileSync(file, readFileSync(file, "utf8").replaceAll("{{REMOTE}}", remoteBase));
  }
  return root;
}

/** Resolves links like Obsidian: exact path, then relative to the note, then by file name. */
export class FsVault implements VaultIO {
  private readonly paths: string[];

  constructor(readonly root: string) {
    this.paths = walk(root).map((p) => relative(root, p).split("\\").join("/"));
  }

  resolve(linkpath: string, sourcePath: string): LinkedFile | null {
    const rel = posix.normalize(posix.join(posix.dirname(sourcePath), linkpath));
    const candidates = [linkpath, rel].flatMap((p) => [p, `${p}.md`]);
    const exact = candidates.find((c) => this.paths.includes(c));
    if (exact) return toLinked(exact);
    const named = this.paths
      .filter((p) => p.endsWith(`/${linkpath}`) || p.endsWith(`/${linkpath}.md`))
      .sort((a, b) => a.length - b.length)[0];
    return named ? toLinked(named) : null;
  }

  readText(path: string): Promise<string> {
    return readFile(join(this.root, path), "utf8");
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const buf = await readFile(join(this.root, path));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  async download(url: string): Promise<Download | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      return {
        data: await res.arrayBuffer(),
        contentType: res.headers.get("content-type") ?? undefined,
      };
    } catch {
      return null;
    }
  }
}
