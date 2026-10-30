import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetFileName, imageExtension, WorkspaceHost } from "../src/export/workspace";
import type { VaultIO } from "../src/export/vault-io";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;
const text = (value: string) => new TextEncoder().encode(value).buffer;

describe("imageExtension", () => {
  it("先頭のバイト列から形式を判定する", () => {
    expect(imageExtension(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d), "text/plain")).toBe("png");
    expect(imageExtension(bytes(0xff, 0xd8, 0xff, 0xe0), undefined)).toBe("jpg");
    expect(imageExtension(text("GIF89a..."), undefined)).toBe("gif");
    expect(imageExtension(text("RIFF\0\0\0\0WEBPVP8 "), "application/octet-stream")).toBe("webp");
    expect(imageExtension(text("\0\0\0\x1cftypavif"), undefined)).toBe("avif");
    expect(imageExtension(text("BM\0\0"), undefined)).toBe("bmp");
  });

  it("text/plain で配信された SVG も SVG と判定する", () => {
    expect(imageExtension(text('<?xml version="1.0"?>\n<svg xmlns="..."/>'), "text/plain")).toBe(
      "svg"
    );
    expect(imageExtension(text("\uFEFF  <svg></svg>"), undefined)).toBe("svg");
  });

  it("中身で判定できなければ画像の Content-Type を使う", () => {
    expect(imageExtension(bytes(1, 2, 3), "image/x-icon")).toBe("ico");
  });

  it("画像でない応答は拒否する", () => {
    expect(imageExtension(text("<!doctype html><html>"), "text/html")).toBeNull();
    expect(imageExtension(bytes(1, 2, 3), undefined)).toBeNull();
  });
});

describe("assetFileName", () => {
  it("ASCII 以外を置き換えて番号を付ける", () => {
    expect(assetFileName(3, "日本語 の画像", "jpg")).toBe("assets/003-_.jpg");
    expect(assetFileName(12, "My Photo", "png")).toBe("assets/012-My_Photo.png");
    expect(assetFileName(0, "", "png")).toBe("assets/000-file.png");
  });
});

function workDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pfpdf-ws-"));
  mkdirSync(join(dir, "assets"));
  return dir;
}

describe("WorkspaceHost", () => {
  const io: VaultIO = {
    resolve: () => null,
    readText: () => Promise.resolve(""),
    readBinary: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    download: (url) =>
      Promise.resolve(
        url.includes("ok")
          ? { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, contentType: "image/png" }
          : url.includes("html")
            ? { data: new TextEncoder().encode("<html>").buffer, contentType: "text/html" }
            : null
      ),
  };

  it("同じファイルと同じ URL は 1 回だけ書き出す", async () => {
    const dir = workDir();
    const host = new WorkspaceHost(io, dir);
    const file = { path: "a/b.png", basename: "b", extension: "png" };
    expect(await host.addLocalAsset(file)).toBe("assets/000-b.png");
    expect(await host.addLocalAsset(file)).toBe("assets/000-b.png");
    expect(await host.addRemoteAsset("https://ok/x")).toBe("assets/001-remote.png");
    expect(await host.addRemoteAsset("https://ok/x")).toBe("assets/001-remote.png");
    expect(readdirSync(join(dir, "assets")).sort()).toEqual(["000-b.png", "001-remote.png"]);
  });

  it("取得できない URL と画像でない応答は null を返す", async () => {
    const dir = workDir();
    const host = new WorkspaceHost(io, dir);
    expect(await host.addRemoteAsset("https://fail/x")).toBeNull();
    expect(await host.addRemoteAsset("https://html/x")).toBeNull();
    expect(await host.addRemoteAsset("https://fail/x")).toBeNull();
  });
});
