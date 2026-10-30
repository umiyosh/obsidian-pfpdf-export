import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultOutputPath, ensurePdfExtension, safeFileName } from "../src/output-path";
import { DEFAULT_SETTINGS, parseSettings } from "../src/settings-data";

describe("parseSettings", () => {
  it("保存データが無ければ既定値を返す", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("broken")).toEqual(DEFAULT_SETTINGS);
  });

  it("正しい値は残し、型や範囲が違う値は既定値に戻す", () => {
    const parsed = parseSettings({
      command: "pfpdf",
      template: "book",
      toc: "yes",
      outputLocation: "folder",
      outputFolder: "exports",
      timeoutSeconds: 5,
      keepWorkDir: true,
      unknown: 1,
    });
    expect(parsed).toMatchObject({
      command: "pfpdf",
      template: "book",
      toc: true,
      outputLocation: "folder",
      outputFolder: "exports",
      timeoutSeconds: 600,
      keepWorkDir: true,
    });
    expect(parsed).not.toHaveProperty("unknown");
  });

  it("未知のテンプレートと空のコマンドは既定値に戻す", () => {
    const parsed = parseSettings({ template: "fancy", command: "  ", outputLocation: "desktop" });
    expect(parsed.template).toBe("default");
    expect(parsed.command).toBe(DEFAULT_SETTINGS.command);
    expect(parsed.outputLocation).toBe("ask");
  });
});

describe("出力先", () => {
  const base = { vaultBase: "/vault", noteFolder: "notes/sub", outputFolder: "", basename: "報告" };

  it("ノートと同じフォルダに置く", () => {
    expect(defaultOutputPath({ ...base, location: "note-folder" })).toBe(
      join("/vault", "notes/sub", "報告.pdf")
    );
    expect(defaultOutputPath({ ...base, location: "ask", noteFolder: "/" })).toBe(
      join("/vault", "報告.pdf")
    );
  });

  it("指定フォルダに置き、未指定ならノートのフォルダに戻す", () => {
    expect(defaultOutputPath({ ...base, location: "folder", outputFolder: "/pdf/" })).toBe(
      join("/vault", "pdf", "報告.pdf")
    );
    expect(defaultOutputPath({ ...base, location: "folder", outputFolder: " " })).toBe(
      join("/vault", "notes/sub", "報告.pdf")
    );
  });

  it("ファイル名に使えない文字を置き換える", () => {
    expect(safeFileName('a/b:c*?"<>|')).toBe("a_b_c______");
    expect(safeFileName("  ")).toBe("note");
  });

  it("拡張子 .pdf を補う", () => {
    expect(ensurePdfExtension("/tmp/x")).toBe("/tmp/x.pdf");
    expect(ensurePdfExtension("/tmp/x.PDF")).toBe("/tmp/x.PDF");
  });
});
