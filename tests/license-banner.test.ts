import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledPackages, licenseBanner } from "../scripts/license-banner.mjs";

const ROOT = join(import.meta.dirname, "..");

describe("バンドルした依存のライセンス表記", () => {
  it("metafile の入力から node_modules のパッケージを重複なく取り出す", () => {
    const inputs = {
      "src/main.ts": {},
      "node_modules/cross-spawn/index.js": {},
      "node_modules/cross-spawn/lib/parse.js": {},
      "node_modules/@scope/pkg/index.js": {},
      "node_modules/which/node_modules/isexe/index.js": {},
    };
    expect(bundledPackages(inputs)).toEqual([
      "node_modules/@scope/pkg",
      "node_modules/cross-spawn",
      "node_modules/which/node_modules/isexe",
    ]);
  });

  it("各パッケージの名前・版・ライセンスと LICENSE の全文をコメントに入れる", () => {
    const banner = licenseBanner(["node_modules/cross-spawn"], ROOT);
    const license = readFileSync(join(ROOT, "node_modules/cross-spawn/LICENSE"), "utf8");
    expect(banner.startsWith("/*")).toBe(true);
    expect(banner.trimEnd().endsWith("*/")).toBe(true);
    expect(banner).toContain("cross-spawn 7.0.6 (MIT)");
    expect(banner).toContain(license.split("\n")[2]?.trim());
    expect(banner.slice(2, -3)).not.toContain("*/");
  });
});
