import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReadiness, INSTALL_COMMAND, readinessFromDoctor } from "../src/export/readiness";

const FAKE_PFPDF = join(import.meta.dirname, "fixtures/fake-pfpdf.mjs");

function check(browser: string, command = `node "${FAKE_PFPDF}"`) {
  return checkReadiness({
    command,
    extraArgs: `--fake-browser ${browser}`,
    searchPath: process.env.PATH ?? "",
  });
}

function doctor(checks: { id: string; status: string; message: string }[]) {
  const output = `pfpdf: warn: SOURCE_DATE_EPOCH is not set\n${JSON.stringify({ command: "doctor", checks })}\n`;
  return readinessFromDoctor({ exitCode: 0, output, timedOut: false }, "pfpdf");
}

describe("pfpdf の準備確認", () => {
  it("ブラウザが使えれば準備済みとする", async () => {
    expect(await check("pass")).toEqual({ ok: true });
  });

  it("ブラウザが未取得なら書き出さず、ターミナルで 1 回変換するよう案内する", async () => {
    const result = await check("missing");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("does not download");
    expect(!result.ok && result.message).toContain("pfpdf --input note.md --output note.pdf");
  });

  it("ブラウザが起動できなければ、pfpdf の示した理由を伝える", async () => {
    const result = await check("fail");
    expect(!result.ok && result.message).toContain("browser exited before startup");
  });

  it("pfpdf が見つからなければインストール方法を案内する", async () => {
    const result = await check("pass", "pfpdf-not-installed-for-test");
    expect(!result.ok && result.message).toContain(INSTALL_COMMAND);
  });

  it("--doctor の結果を読めなければ pfpdf 0.3.0 以降が要ると伝える", async () => {
    const result = await check("garbage");
    expect(!result.ok && result.message).toContain("pfpdf 0.3.0 or later");
  });

  it("ブラウザ以外の項目が fail ならその内容を伝え、warning は通す", () => {
    const failed = doctor([
      { id: "node-version", status: "fail", message: "Node.js 20.0.0 (>= 22.12.0 required)" },
      { id: "fonts", status: "warning", message: "1 font warning(s)" },
      { id: "browser", status: "pass", message: "ok" },
    ]);
    expect(!failed.ok && failed.message).toContain("Node.js 20.0.0 (>= 22.12.0 required)");
    expect(!failed.ok && failed.message).not.toContain("font");

    const warned = doctor([
      { id: "fonts", status: "warning", message: "1 font warning(s)" },
      { id: "browser", status: "pass", message: "ok" },
    ]);
    expect(warned).toEqual({ ok: true });
  });

  it("ブラウザの項目が無い結果は準備済みとしない", () => {
    expect(doctor([{ id: "node-version", status: "pass", message: "ok" }]).ok).toBe(false);
  });

  it("時間切れを伝える", () => {
    const result = readinessFromDoctor({ exitCode: null, output: "", timedOut: true }, "pfpdf");
    expect(!result.ok && result.message).toContain("timed out");
  });
});
