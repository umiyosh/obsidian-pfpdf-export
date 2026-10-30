import { describe, expect, it } from "vitest";
import { convertBody } from "../src/convert/document";
import { FakeHost } from "./helpers/fake-host";

const VAULT = {
  "notes/note.md": "",
  "attachments/photo.png": "",
  "attachments/日本語 画像.jpg": "",
  "notes/local.svg": "",
  "notes/sub/deep.webp": "",
  "attachments/scan.heic": "",
  "drawings/board.excalidraw.md": "---\nexcalidraw-plugin: parsed\n---\n# Drawing",
  "drawings/board.excalidraw.svg": "",
  "drawings/raw.excalidraw.md": "# Drawing",
  "docs/manual.pdf": "",
};

async function convert(text: string, host = new FakeHost(VAULT)) {
  const out = await convertBody(text, host, "notes/note.md");
  return { out, host };
}

describe("wiki 形式の画像埋め込み", () => {
  it("Vault 内の画像をコピーし Markdown 画像にする", async () => {
    const { out, host } = await convert("前 ![[photo.png]] 後");
    expect(out).toBe("前 ![](assets/0.png) 後");
    expect(host.localAssets).toEqual(["attachments/photo.png"]);
  });

  it("幅指定は img 要素の width になる", async () => {
    const { out } = await convert("![[photo.png|300]]");
    expect(out).toBe('<img src="assets/0.png" alt="" width="300">');
  });

  it("幅x高さと代替テキストを解釈する", async () => {
    const { out } = await convert("![[photo.png|写真|300x200]]");
    expect(out).toBe('<img src="assets/0.png" alt="写真" width="300" height="200">');
  });

  it("表の中のエスケープされたパイプも区切りとして扱う", async () => {
    const { out } = await convert("| a | ![[photo.png\\|120]] |");
    expect(out).toBe('| a | <img src="assets/0.png" alt="" width="120"> |');
  });

  it("日本語と空白を含むファイル名を解決する", async () => {
    const { out, host } = await convert("![[日本語 画像.jpg]]");
    expect(out).toBe("![](assets/0.jpg)");
    expect(host.localAssets).toEqual(["attachments/日本語 画像.jpg"]);
  });

  it("同じ画像は 1 回だけコピーする", async () => {
    const { out, host } = await convert("![[photo.png]]\n![[photo.png|50]]");
    expect(out).toBe('![](assets/0.png)\n<img src="assets/0.png" alt="" width="50">');
    expect(host.localAssets).toHaveLength(1);
  });

  it("見つからない画像は代替表示にして警告する", async () => {
    const { out, host } = await convert("![[nothing.png]]");
    expect(out).toBe("*\\[Missing: nothing.png\\]*");
    expect(host.warnings).toEqual(["Embedded file not found: nothing.png (in notes/note.md)"]);
  });

  it("Chromium が描画できない形式は代替表示にして警告する", async () => {
    const { out, host } = await convert("![[scan.heic]]");
    expect(out).toBe("*\\[Unsupported image: scan.heic\\]*");
    expect(host.warnings[0]).toContain("cannot render HEIC");
  });

  it("画像以外の添付ファイルはファイル名を表示する", async () => {
    const { out } = await convert("![[manual.pdf]]");
    expect(out).toBe("*\\[Attachment: manual.pdf\\]*");
  });

  it("Excalidraw は書き出し済みの SVG を使う", async () => {
    const { out, host } = await convert("![[board.excalidraw]]");
    expect(out).toBe("![](assets/0.svg)");
    expect(host.localAssets).toEqual(["drawings/board.excalidraw.svg"]);
  });

  it("書き出しの無い Excalidraw は警告する", async () => {
    const { out, host } = await convert("![[raw.excalidraw]]");
    expect(out).toBe("*\\[Excalidraw drawing: raw.excalidraw\\]*");
    expect(host.warnings[0]).toContain("Enable SVG or PNG auto-export");
  });
});

describe("Markdown 形式の画像", () => {
  it("ノートからの相対パスを解決する", async () => {
    const { out, host } = await convert("![図](local.svg) ![深い](./sub/deep.webp)");
    expect(out).toBe("![図](assets/0.svg) ![深い](assets/1.webp)");
    expect(host.localAssets).toEqual(["notes/local.svg", "notes/sub/deep.webp"]);
  });

  it("山括弧とパーセントエンコードのパスを解決する", async () => {
    const { out } = await convert(
      "![a](<../attachments/日本語 画像.jpg>) ![b](../attachments/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%E7%94%BB%E5%83%8F.jpg)"
    );
    expect(out).toBe("![a](assets/0.jpg) ![b](assets/0.jpg)");
  });

  it("代替テキストのサイズ指定を解釈する", async () => {
    const { out } = await convert("![ロゴ|64](local.svg)");
    expect(out).toBe('<img src="assets/0.svg" alt="ロゴ" width="64">');
  });

  it("タイトル付きの画像も解決する", async () => {
    const { out } = await convert('![x](local.svg "タイトル")');
    expect(out).toBe("![x](assets/0.svg)");
  });

  it("リモート画像はダウンロードしてローカル画像にする", async () => {
    const { out, host } = await convert("![r](https://example.com/a.png)");
    expect(out).toBe("![r](assets/remote-0.png)");
    expect(host.remoteAssets).toEqual(["https://example.com/a.png"]);
  });

  it("ダウンロードに失敗したリモート画像は URL のまま残して警告する", async () => {
    const host = new FakeHost(VAULT, ["https://example.com/gone.png"]);
    const { out } = await convert("![r](https://example.com/gone.png)", host);
    expect(out).toBe("![r](https://example.com/gone.png)");
    expect(host.warnings[0]).toContain("Could not download image: https://example.com/gone.png");
  });

  it("data URI はそのまま残す", async () => {
    const { out, host } = await convert("![d](data:image/png;base64,AAAA)");
    expect(out).toBe("![d](data:image/png;base64,AAAA)");
    expect(host.localAssets).toEqual([]);
  });

  it("見つからないローカル画像は代替表示にする", async () => {
    const { out, host } = await convert("![x](missing.png)");
    expect(out).toBe("*\\[Missing: missing.png\\]*");
    expect(host.warnings).toHaveLength(1);
  });

  it("画像リンクで囲まれた外部リンクを保つ", async () => {
    const { out } = await convert("[![badge](https://example.com/b.svg)](https://example.com)");
    expect(out).toBe("[![badge](assets/remote-0.png)](https://example.com)");
  });
});

describe("HTML の img 要素", () => {
  it("ローカルの src を解決する", async () => {
    const { out } = await convert('<img src="local.svg" width="40" alt="x">');
    expect(out).toBe('<img src="assets/0.svg" width="40" alt="x">');
  });

  it("リモートの src をダウンロードする", async () => {
    const { out } = await convert("<img alt='y' src='https://example.com/p.png'>");
    expect(out).toBe("<img alt='y' src=\"assets/remote-0.png\">");
  });

  it("解決できない src はそのまま残して警告する", async () => {
    const { out, host } = await convert('<img src="nothing.png">');
    expect(out).toBe('<img src="nothing.png">');
    expect(host.warnings).toHaveLength(1);
  });
});
