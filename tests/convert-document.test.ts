import { describe, expect, it } from "vitest";
import { convertBody, convertDocument } from "../src/convert/document";
import { FakeHost } from "./helpers/fake-host";

const VAULT = {
  "notes/note.md": "",
  "notes/child.md":
    "---\ntags: [x]\n---\n# 子\n\n![[photo.png]]\n\n## 節 A\n\nA の本文\n\n## 節 B\n\nB の本文",
  "notes/blocks.md":
    "前の段落\n\n対象の段落\n2 行目 ^para\n\n- 項目 1\n- 項目 2 ^item\n\n| t |\n|---|\n^table",
  "notes/loop-a.md": "A ![[loop-b]]",
  "notes/loop-b.md": "B ![[loop-a]]",
  "attachments/photo.png": "",
  "assets/logo.svg": "",
  "refs/main.bib": "",
};

const DEFAULTS = { template: "default", toc: true } as const;

describe("ノートの埋め込み", () => {
  it("ノート全体を展開し、埋め込み先の front matter を除く", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertBody("![[child]]", host, "notes/note.md");
    expect(out).toContain("# 子\n\n![](assets/0.png)");
    expect(out).not.toContain("tags");
  });

  it("見出しの節だけを展開する", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertBody("![[child#節 A]]", host, "notes/note.md");
    expect(out.trim()).toBe("## 節 A\n\nA の本文");
  });

  it("ブロック参照は段落・リスト項目・直前のブロックを展開する", async () => {
    const host = new FakeHost(VAULT);
    const para = await convertBody("![[blocks#^para]]", host, "notes/note.md");
    const item = await convertBody("![[blocks#^item]]", host, "notes/note.md");
    const table = await convertBody("![[blocks#^table]]", host, "notes/note.md");
    expect(para.trim()).toBe("対象の段落\n2 行目");
    expect(item.trim()).toBe("- 項目 2");
    expect(table.trim()).toBe("| t |\n|---|");
  });

  it("存在しない節は代替表示にして警告する", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertBody("![[child#無い節]]", host, "notes/note.md");
    expect(out).toBe("*\\[Missing section: child#無い節\\]*");
    expect(host.warnings).toHaveLength(1);
  });

  it("循環する埋め込みは止めて警告する", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertBody("![[loop-a]]", host, "notes/note.md");
    expect(out).toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("*\\[Circular embed: loop-a\\]*");
    expect(host.warnings[0]).toContain("Circular embed");
  });
});

describe("文書全体", () => {
  it("front matter が無ければノート名をタイトルにし既定値を補う", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertDocument(
      { path: "notes/note.md", content: "本文", title: "note" },
      host,
      DEFAULTS
    );
    expect(out).toBe('---\ntitle: "note"\ntemplate: "default"\ntoc: true\n---\n\n本文\n');
  });

  it("pfpdf が使うキーだけを型を確かめて渡す", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertDocument(
      {
        path: "notes/note.md",
        content: "---\ntitle: x\n---\n本文",
        title: "note",
        frontmatter: {
          title: "報告書",
          author: ["山田", "佐藤"],
          template: "book",
          toc: false,
          date: "2026-10-29",
          lang: "en",
          dir: "sideways",
          confidential: "yes",
          tags: ["a"],
          series: 3,
        },
      },
      host,
      DEFAULTS
    );
    expect(out).toBe(
      [
        "---",
        'title: "報告書"',
        'author: "山田, 佐藤"',
        'series: "3"',
        'template: "book"',
        "toc: false",
        'date: "2026-10-29"',
        'lang: "en"',
        "---",
        "",
        "本文",
        "",
      ].join("\n")
    );
    expect(host.warnings).toEqual([
      'Ignored front matter "dir": expected ltr, rtl or auto',
      'Ignored front matter "confidential": expected true or false',
    ]);
  });

  it("未知のテンプレートは既定値に戻して警告する", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertDocument(
      { path: "notes/note.md", content: "", title: "n", frontmatter: { template: "fancy" } },
      host,
      { template: "compact", toc: false }
    );
    expect(out).toContain('template: "compact"');
    expect(host.warnings[0]).toContain("fancy");
  });

  it("logo と bibliography のファイルを作業ディレクトリへコピーする", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertDocument(
      {
        path: "notes/note.md",
        content: "",
        title: "n",
        frontmatter: { logo: "../assets/logo.svg", bibliography: "../refs/main.bib" },
      },
      host,
      DEFAULTS
    );
    expect(out).toContain('logo: "assets/0.svg"');
    expect(out).toContain('bibliography: ["assets/1.bib"]');
  });

  it("logo: false はそのまま渡し、見つからない logo は警告して除く", async () => {
    const off = await convertDocument(
      { path: "notes/note.md", content: "", title: "n", frontmatter: { logo: false } },
      new FakeHost(VAULT),
      DEFAULTS
    );
    expect(off).toContain("logo: false");

    const host = new FakeHost(VAULT);
    const missing = await convertDocument(
      { path: "notes/note.md", content: "", title: "n", frontmatter: { logo: "none.png" } },
      host,
      DEFAULTS
    );
    expect(missing).not.toContain("logo");
    expect(host.warnings[0]).toContain("none.png");
  });

  it("callout があるときだけスタイルを先頭に入れる", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertDocument(
      { path: "notes/note.md", content: "> [!tip] t\n> b", title: "n" },
      host,
      DEFAULTS
    );
    expect(out).toMatch(/---\n\n<style>[\s\S]*\.pfpdf-callout[\s\S]*<\/style>\n\n<div/);
  });

  it("CRLF の改行も扱う", async () => {
    const host = new FakeHost(VAULT);
    const out = await convertDocument(
      { path: "notes/note.md", content: "---\r\na: 1\r\n---\r\n[[child]]\r\n", title: "n" },
      host,
      DEFAULTS
    );
    expect(out).toContain("\n\nchild\n");
    expect(out).not.toContain("\r");
  });
});
