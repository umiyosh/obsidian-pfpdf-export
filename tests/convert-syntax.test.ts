import { describe, expect, it } from "vitest";
import { convertBody } from "../src/convert/document";
import { FakeHost } from "./helpers/fake-host";

const VAULT = {
  "notes/note.md": "",
  "notes/other.md": "# Other",
  "attachments/photo.png": "",
};

async function convert(text: string) {
  const host = new FakeHost(VAULT);
  const out = await convertBody(text, host, "notes/note.md");
  return { out, host };
}

describe("リンク", () => {
  it("wiki リンクは表示テキストにする", async () => {
    const { out } = await convert("[[other]] と [[other|別名]] と [[other#節]] と [[#^abc]]");
    expect(out).toBe("other と 別名 と other > 節 と abc");
  });

  it("文書外の Markdown リンクは pfpdf の入力エラーを避けるため表示テキストにする", async () => {
    const { out } = await convert("[他](other.md) [節](#heading) [外](https://example.com)");
    expect(out).toBe("他 節 [外](https://example.com)");
  });

  it("mailto や obsidian スキームのリンクは残す", async () => {
    const { out } = await convert("[m](mailto:a@example.com) [o](obsidian://open?vault=x)");
    expect(out).toBe("[m](mailto:a@example.com) [o](obsidian://open?vault=x)");
  });
});

describe("コードと数式は変換しない", () => {
  it("フェンスの中は変換しない", async () => {
    const text = "```md\n![[photo.png]] [[other]] ==x== %%c%%\n```\n==y==";
    const { out } = await convert(text);
    expect(out).toBe("```md\n![[photo.png]] [[other]] ==x== %%c%%\n```\n<mark>y</mark>");
  });

  it("チルダのフェンスと長いバッククォートのフェンスも認識する", async () => {
    const text = "~~~\n[[a]]\n~~~\n````\n```\n[[b]]\n````\n[[c]]";
    const { out } = await convert(text);
    expect(out).toBe("~~~\n[[a]]\n~~~\n````\n```\n[[b]]\n````\nc");
  });

  it("インラインコードの中は変換しない", async () => {
    const { out } = await convert("`[[other]]` と ``a ` ==b== `` と [[other]]");
    expect(out).toBe("`[[other]]` と ``a ` ==b== `` と other");
  });

  it("インライン数式の中は変換しない", async () => {
    const { out } = await convert("$a == b$ と ==強調==");
    expect(out).toBe("$a == b$ と <mark>強調</mark>");
  });

  it("ディスプレイ数式の中は変換しない", async () => {
    const { out } = await convert("$$\nx == [[y]]\n$$\n[[other]]");
    expect(out).toBe("$$\nx == [[y]]\n$$\nother");
  });
});

describe("Obsidian 固有の記法", () => {
  it("1 行内のコメントを削除する", async () => {
    const { out } = await convert("見える %%見えない%% 見える");
    expect(out).toBe("見える  見える");
  });

  it("複数行のコメントを削除する", async () => {
    const { out } = await convert("前\n%%\n```\n隠す\n```\n%%\n後 %%a\nb%% 末尾");
    expect(out).toBe("前\n後 \n 末尾");
  });

  it("ブロック ID を削除する", async () => {
    const { out } = await convert("段落 ^block-1\n\n^table-id\n- 項目 ^li");
    expect(out).toBe("段落\n\n\n- 項目");
  });

  it("インライン脚注を番号付き脚注に変換する", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertBody("本文^[注釈 1]と^[注釈 2]", host, "notes/note.md");
    expect(out).toBe("本文[^pfpdf-1]と[^pfpdf-2]\n\n[^pfpdf-1]: 注釈 1\n[^pfpdf-2]: 注釈 2");
  });
});

describe("callout", () => {
  it("タイトル付きの callout を HTML ブロックにする", async () => {
    const { out } = await convert("前\n> [!warning]- 注意して\n> 本文 [[other]]\n後");
    expect(out).toBe(
      [
        "前",
        "",
        '<div class="pfpdf-callout pfpdf-callout-warning">',
        '<div class="pfpdf-callout-title">',
        "",
        "注意して",
        "",
        "</div>",
        "",
        "本文 other",
        "",
        "</div>",
        "",
        "後",
      ].join("\n")
    );
  });

  it("タイトルが無ければ種類名を使い、別名は同じ色の系統にまとめる", async () => {
    const { out } = await convert("> [!faq]\n> 質問");
    expect(out).toContain('<div class="pfpdf-callout pfpdf-callout-question">');
    expect(out).toContain("\nFaq\n");
  });

  it("未知の種類は note の色にする", async () => {
    const { out } = await convert("> [!custom] T");
    expect(out).toContain("pfpdf-callout-note");
    expect(out).not.toContain("\n\n\n");
  });

  it("入れ子の callout も変換する", async () => {
    const { out } = await convert("> [!note] 外\n> > [!tip] 内\n> > 本文");
    expect(out).toContain("pfpdf-callout-note");
    expect(out).toContain("pfpdf-callout-tip");
    expect(out).toContain("\n本文\n");
  });

  it("フェンスの中の callout 記法は変換しない", async () => {
    const { out } = await convert("```\n> [!note] x\n```");
    expect(out).toBe("```\n> [!note] x\n```");
  });

  it("通常の引用はそのまま残す", async () => {
    const { out } = await convert("> 引用\n> 続き");
    expect(out).toBe("> 引用\n> 続き");
  });
});
