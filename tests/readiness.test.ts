import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReadiness, INSTALL_COMMAND, readinessFromVersion } from "../src/export/readiness";

const FAKE_PFPDF = join(import.meta.dirname, "fixtures/fake-pfpdf.mjs");

function check(command = `node "${FAKE_PFPDF}"`) {
  return checkReadiness({ command, searchPath: process.env.PATH ?? "", timeoutMs: 10_000 });
}

describe("pfpdf の準備確認", () => {
  it("--version に答えた pfpdf は準備済みとし、そのバージョンを返す", async () => {
    expect(await check()).toEqual({ ok: true, version: "0.3.0" });
  });

  it("pfpdf が見つからなければインストール方法を案内する", async () => {
    const result = await check("pfpdf-not-installed-for-test");
    expect(!result.ok && result.message).toContain(INSTALL_COMMAND);
  });

  it("起動できない理由が見つからない以外なら、その理由を伝える", () => {
    const result = readinessFromVersion(
      { exitCode: null, output: "", timedOut: false, startError: "spawn pfpdf EACCES" },
      "pfpdf"
    );
    expect(!result.ok && result.message).toContain("EACCES");
  });

  it("--version が失敗したら出力の末尾を伝える", () => {
    const output = "node: bad option\nError: Node.js 22.12 or later is required\n";
    const result = readinessFromVersion({ exitCode: 1, output, timedOut: false }, "pfpdf");
    expect(!result.ok && result.message).toContain("Node.js 22.12 or later is required");
  });

  it("時間切れを伝える", () => {
    const result = readinessFromVersion({ exitCode: null, output: "", timedOut: true }, "pfpdf");
    expect(!result.ok && result.message).toContain("timed out");
  });
});
