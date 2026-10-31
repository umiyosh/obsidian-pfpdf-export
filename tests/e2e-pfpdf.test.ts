import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportNote } from "../src/export/pipeline";
import { FsVault, prepareVault } from "./helpers/fs-vault";
import { startImageServer } from "./helpers/image-server";

// Runs the real pfpdf (and its Chromium), so it is opt-in: `make e2e`.
const enabled = process.env.PFPDF_E2E === "1";
const OUT = join(import.meta.dirname, ".output/e2e");
// Developers need not install pfpdf globally; the plugin itself never runs npx.
const COMMAND = process.env.PFPDF_COMMAND ?? "npx -y @pfnet-research/pfpdf@0.3.0";

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
  return result.stdout;
}

/** Width x height of every raster image embedded in the PDF, from poppler's pdfimages. */
function rasterImages(pdf: string): string[] {
  return run("pdfimages", ["-list", pdf])
    .split("\n")
    .slice(2)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols[2] === "image")
    .map((cols) => `${cols[3]}x${cols[4]}`);
}

describe.runIf(enabled)("実際の pfpdf での PDF 出力", () => {
  let server: Server;
  let vault: FsVault;

  beforeAll(async () => {
    const started = await startImageServer();
    server = started.server;
    vault = new FsVault(prepareVault(started.base));
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
  });

  afterAll(() => {
    server.close();
    rmSync(vault.root, { recursive: true, force: true });
  });

  it("ノートのすべての画像が PDF に入る", { timeout: 600_000 }, async () => {
    const path = "notes/report.md";
    const pdf = join(OUT, "report.pdf");
    const result = await exportNote(
      vault,
      {
        path,
        content: await vault.readText(path),
        title: "report",
        frontmatter: {
          title: "画像エクスポートの検証",
          author: ["検証 太郎"],
          template: "technical",
        },
      },
      pdf,
      {
        command: COMMAND,
        extraArgs: "",
        defaults: { template: "default", toc: true },
        searchPath: process.env.PATH ?? "",
        keepWorkDir: false,
        timeoutMs: 600_000,
      }
    );

    expect(result.warnings).toEqual([]);
    const images = rasterImages(pdf);
    // photo (x2: inline and in the callout), wide (x2: sized and in the embed), JPEG, remote PNG.
    for (const size of ["240x160", "400x100", "200x140", "160x160"]) {
      expect(images).toContain(size);
    }
    const text = run("pdftotext", [pdf, "-"]);
    expect(text.match(/SVG diagram/g)?.length).toBe(2);
    expect(text).toContain("埋め込まれた本文");
    expect(text).not.toContain("ここは埋め込まない");
    expect(text).not.toContain("コメント");
    run("pdftoppm", ["-r", "60", "-png", pdf, join(OUT, "page")]);
  });
});
