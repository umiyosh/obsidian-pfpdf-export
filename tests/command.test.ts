import { describe, expect, it } from "vitest";
import {
  buildSearchPath,
  loginShellPath,
  parseLoginShellOutput,
  runCommand,
  splitCommand,
} from "../src/export/command";

describe("splitCommand", () => {
  it("空白で区切り、引用符の中の空白を保つ", () => {
    expect(splitCommand(`npx --yes "@pfnet-research/pfpdf@0.3.0"`)).toEqual([
      "npx",
      "--yes",
      "@pfnet-research/pfpdf@0.3.0",
    ]);
    expect(splitCommand(`"/Applications/My Tools/pfpdf" --log-level 'debug info'`)).toEqual([
      "/Applications/My Tools/pfpdf",
      "--log-level",
      "debug info",
    ]);
    expect(splitCommand(`"a \\"b\\""`)).toEqual(['a "b"']);
    expect(splitCommand("   ")).toEqual([]);
  });

  it("引用符の中の Windows のパスのバックスラッシュを残す", () => {
    expect(splitCommand(String.raw`"C:\Program Files\nodejs\pfpdf.cmd" --host-fonts`)).toEqual([
      String.raw`C:\Program Files\nodejs\pfpdf.cmd`,
      "--host-fonts",
    ]);
    expect(splitCommand(String.raw`"\\server\tools\pfpdf.cmd"`)).toEqual([
      String.raw`\\server\tools\pfpdf.cmd`,
    ]);
    expect(splitCommand(String.raw`C:\tools\pfpdf.cmd`)).toEqual([String.raw`C:\tools\pfpdf.cmd`]);
  });
});

describe("buildSearchPath", () => {
  it("設定・ログインシェル・現在の PATH・既定の場所の順に重複なく並べる", () => {
    const path = buildSearchPath({
      extra: "/custom/bin",
      loginShell: "/opt/homebrew/bin:/shell/bin",
      current: "/usr/bin:/bin",
      home: "/Users/me",
      platform: "darwin",
    });
    const parts = path.split(":");
    expect(parts.slice(0, 5)).toEqual([
      "/custom/bin",
      "/opt/homebrew/bin",
      "/shell/bin",
      "/usr/bin",
      "/bin",
    ]);
    expect(parts).toContain("/Users/me/.nodebrew/current/bin");
    expect(new Set(parts).size).toBe(parts.length);
  });

  it("Windows では ; で区切り、既定の場所を足さない", () => {
    const path = buildSearchPath({
      extra: "",
      loginShell: null,
      current: "C:\\node;C:\\Windows",
      home: "C:\\Users\\me",
      platform: "win32",
    });
    expect(path).toBe("C:\\node;C:\\Windows");
  });
});

describe("ログインシェルの PATH", () => {
  it("目印の間の値を取り出す", () => {
    expect(parseLoginShellOutput("motd\n__PFPDF_PATH__/a:/b__PFPDF_PATH__")).toBe("/a:/b");
    expect(parseLoginShellOutput("no markers")).toBeNull();
  });

  // The plugin reads the login shell only on macOS and Linux (see searchPath in main.ts).
  it.skipIf(process.platform === "win32")("実際のシェルから PATH を読む", async () => {
    const path = await loginShellPath("/bin/sh");
    expect(path).toContain("/");
  });

  it("起動できないシェルでは null を返す", async () => {
    expect(await loginShellPath("/nonexistent/shell")).toBeNull();
  });
});

describe("runCommand", () => {
  it("終了コードと出力を返す", async () => {
    const result = await runCommand(["node", "-e", "console.error('oops'); process.exit(3)"], {
      timeoutMs: 10_000,
    });
    expect(result).toMatchObject({ exitCode: 3, timedOut: false });
    expect(result.output).toContain("oops");
  });

  it("シェルの特殊文字を含む引数をそのまま渡し、別のコマンドとして実行しない", async () => {
    const tricky = ["a&echo injected", "%PATH%", "x|y", "$(echo z)", "R&D report.pdf", 'q"uote'];
    const result = await runCommand(
      ["node", "-e", "console.log(JSON.stringify(process.argv.slice(1)))", ...tricky],
      { timeoutMs: 10_000 }
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(tricky);
  });

  it("起動できないコマンドは startError を返す", async () => {
    const result = await runCommand(["/nonexistent/pfpdf"], { timeoutMs: 10_000 });
    expect(result.exitCode).toBeNull();
    expect(result.startError).toContain("ENOENT");
  });

  it("時間切れのプロセスを止める", async () => {
    const result = await runCommand(["node", "-e", "setTimeout(() => {}, 10000)"], {
      timeoutMs: 200,
    });
    expect(result).toMatchObject({ exitCode: null, timedOut: true });
  });
});
