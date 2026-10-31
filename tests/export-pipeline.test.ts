import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ExportError,
  exportNote,
  failureMessage,
  pfpdfWarnings,
  type ExportOptions,
} from "../src/export/pipeline";
import { INSTALL_COMMAND } from "../src/export/readiness";
import { FsVault, prepareVault } from "./helpers/fs-vault";
import { startImageServer } from "./helpers/image-server";

const FAKE_PFPDF = join(import.meta.dirname, "fixtures/fake-pfpdf.mjs");

const OPTIONS: ExportOptions = {
  command: `node "${FAKE_PFPDF}"`,
  extraArgs: "",
  defaults: { template: "default", toc: true },
  searchPath: process.env.PATH ?? "",
  keepWorkDir: true,
  timeoutMs: 20_000,
};

let server: Server;
let vault: FsVault;

beforeAll(async () => {
  const started = await startImageServer();
  server = started.server;
  vault = new FsVault(prepareVault(started.base));
});

afterAll(() => {
  server.close();
  rmSync(vault.root, { recursive: true, force: true });
});

async function exportReport(options: Partial<ExportOptions> = {}, content?: string) {
  const path = "notes/report.md";
  const note = {
    path,
    content: content ?? (await vault.readText(path)),
    title: "report",
    frontmatter: { title: "画像エクスポートの検証", template: "technical" },
  };
  const output = join(vault.root, "out", "report.pdf");
  return exportNote(vault, note, output, { ...OPTIONS, ...options });
}

describe("exportNote", () => {
  it("画像をすべて作業ディレクトリへ集め、pfpdf に渡して PDF を書き出す", async () => {
    const result = await exportReport();
    expect(readFileSync(result.outputPath, "utf8")).toMatch(/^%PDF/);
    const workDir = result.workDir ?? "";
    const markdown = readFileSync(join(workDir, "document.md"), "utf8");
    const assets = readdirSync(join(workDir, "assets")).sort();

    expect(assets).toEqual([
      "000-photo.png",
      "001-wide.png",
      "002-_.jpg",
      "003-diagram.svg",
      "004-remote.png",
    ]);
    expect(markdown).toContain("![](assets/000-photo.png)");
    expect(markdown).toContain('<img src="assets/001-wide.png" alt="" width="300">');
    expect(markdown).toContain("![日本語](assets/002-_.jpg)");
    expect(markdown).toContain('<img src="assets/003-diagram.svg" width="160" alt="html">');
    expect(markdown).toContain("![remote](assets/004-remote.png)");
    expect(markdown).toContain('<img src="assets/001-wide.png" alt="" width="200">');
    expect(markdown).toContain("`![[photo.png]]`");
    expect(markdown).not.toContain("{{REMOTE}}");
    rmSync(workDir, { recursive: true, force: true });
  });

  it("pfpdf の警告から毎回出る SOURCE_DATE_EPOCH の警告を除いて返す", async () => {
    const result = await exportReport({ keepWorkDir: false });
    expect(result.warnings).toEqual(["unknown front matter key: cssclasses"]);
    expect(result.workDir).toBeUndefined();
  });

  it("失敗したら要点だけのメッセージとログを持つ ExportError を投げ、作業ディレクトリを消す", async () => {
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith("pfpdf-export-")).length;
    const error = await exportReport({ keepWorkDir: false }, "FAIL_PFPDF").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExportError);
    if (!(error instanceof ExportError)) return;
    expect(error.message).toBe(
      "pfpdf exited with code 2:\nERROR Error: MathJax reported a TeX error"
    );
    expect(error.log).toContain("MathJax");
    const after = readdirSync(tmpdir()).filter((n) => n.startsWith("pfpdf-export-")).length;
    expect(after).toBe(before);
  });

  it("出力先のフォルダが無ければ作る", async () => {
    rmSync(join(vault.root, "out"), { recursive: true, force: true });
    const result = await exportReport({ keepWorkDir: false });
    expect(existsSync(result.outputPath)).toBe(true);
  });
});

describe("pfpdf のログ解析", () => {
  it("pfpdf: warn 行だけを警告として取り出す", () => {
    expect(
      pfpdfWarnings("npm warn x\npfpdf: warn: a\n\u001b[33mpfpdf: warning: b\u001b[39m\nother")
    ).toEqual(["a", "b"]);
  });

  it("コマンドが見つからなければインストール方法を、その他の起動失敗と時間切れは設定の見直しを伝える", () => {
    expect(
      failureMessage(
        { exitCode: null, output: "", timedOut: false, startError: "spawn pfpdf ENOENT" },
        "pfpdf"
      )
    ).toContain(INSTALL_COMMAND);
    expect(
      failureMessage(
        { exitCode: null, output: "", timedOut: false, startError: "spawn pfpdf EACCES" },
        "pfpdf"
      )
    ).toContain("Check the pfpdf command and the Node.js path");
    expect(failureMessage({ exitCode: null, output: "", timedOut: true }, "pfpdf")).toContain(
      "timed out"
    );
  });

  it("エラー行が無ければ最後の行を示し、npm の警告は除く", () => {
    expect(
      failureMessage(
        { exitCode: 1, output: "line 1\nline 2\nnpm warn noise\n", timedOut: false },
        "x"
      )
    ).toBe("pfpdf exited with code 1:\nline 1\nline 2");
  });
});
