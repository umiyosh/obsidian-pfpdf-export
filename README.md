# pfpdf Export for Obsidian

Obsidian のノートを [pfpdf](https://github.com/pfnet-research/pfpdf) で組版し、表紙・目次付きの PDF に書き出すデスクトップ専用プラグイン。

ノートに埋め込んだ画像（Vault 内の画像、サイズ指定、HTML の `<img>`、リモート画像）は、すべて PDF に入る。

## 必要なもの

- Obsidian 1.13.0 以降（デスクトップ版）
- Node.js 22.12 以降
- 初回の書き出し時に、pfpdf と描画用の Chromium が自動でダウンロードされる（数分かかることがある）

## インストール

1. `npm install && npm run build` で `main.js` を作る
2. Vault の `.obsidian/plugins/pfpdf-export/` に `main.js` と `manifest.json` を置く
3. 設定 → コミュニティプラグインで「pfpdf Export」を有効にする

## 使い方

- コマンドパレットで「Export current note to PDF」を実行する
- またはファイルエクスプローラーでノートを右クリックし「Export to PDF with pfpdf」を選ぶ

テンプレートや目次は、ノートの front matter で指定できる。

```yaml
---
title: 四半期報告書
author: 山田 太郎
template: technical
toc: true
---
```

pfpdf が使うキー（`title`、`author`、`series`、`template`、`toc`、`date`、`page_size`、`lang`、`dir`、`confidential`、`logo`、`bibliography`）だけを型を確かめて渡す。`tags` などほかのキーは無視する。`title` が無ければノート名を使う。

## Obsidian 記法の扱い

pfpdf は GitHub Flavored Markdown を組版するため、Obsidian 固有の記法は書き出し前に変換する。

| 記法                                                            | PDF での扱い                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `![[画像.png]]`、`![[画像.png\|300]]`、`![[画像.png\|300x200]]` | 画像。サイズ指定を反映する                                            |
| `![代替](相対パス.png)`、`![代替](<空白 を含む.png>)`           | 画像。ノートからの相対パスを解決する                                  |
| `<img src="相対パス.png">`                                      | 画像                                                                  |
| `![](https://…)`                                                | ダウンロードして画像として埋め込む。失敗したら URL のまま残し警告する |
| `![[ノート]]`、`![[ノート#見出し]]`、`![[ノート#^ブロック]]`    | 本文を展開する。循環は止める                                          |
| `![[図.excalidraw]]`                                            | Excalidraw が自動書き出しした SVG / PNG を使う                        |
| `[[リンク\|別名]]`、ノートへの Markdown リンク                  | 表示テキスト（pfpdf は文書外へのリンクを受け付けないため）            |
| `> [!note] タイトル`（callout）                                 | 色付きの枠                                                            |
| `==ハイライト==`                                                | ハイライト                                                            |
| `%%コメント%%`、`^block-id`                                     | 削除する                                                              |
| `^[インライン脚注]`                                             | 脚注                                                                  |
| コードブロック、インラインコード、数式                          | そのまま                                                              |

### 注意点

- 単独行の `___`（アンダースコア 3 個以上）は、pfpdf では改ページになる。水平線には `---` を使う
- Dataview などプラグインが描画する内容は、描画結果ではなくコードブロックの元の記述のまま PDF に出る。Obsidian の画面ではなくノートの記法から組版するため
- pfpdf はノート内の raw HTML と `<script>` をそのまま実行する（[pfpdf のセキュリティ方針](https://github.com/pfnet-research/pfpdf/blob/main/SECURITY.md)）。出所の分からないノートは書き出さない
- HEIC / TIFF 画像は Chromium が描画できない。PNG か JPEG に変換する
- 数式の構文に誤りがあると、pfpdf は PDF を作らずに失敗する。本文で `$` を使うときは `\$` と書く

## 設定

| 設定                   | 既定値                                  | 内容                                                               |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Default template       | `default`                               | front matter に `template` が無いときのテンプレート                |
| Table of contents      | オン                                    | front matter に `toc` が無いときの目次の有無                       |
| Save location          | Ask every time                          | 保存ダイアログで選ぶ／ノートと同じフォルダ／Vault 内の指定フォルダ |
| Open after export      | オン                                    | 書き出した PDF を開く                                              |
| Pfpdf command          | `npx --yes @pfnet-research/pfpdf@0.3.0` | pfpdf を起動するコマンド。「Check pfpdf」で動作を確認できる        |
| Extra arguments        | なし                                    | pfpdf に毎回渡す引数（例: `--host-fonts`）                         |
| Additional search path | なし                                    | Node.js が見つからないときに足す PATH                              |
| Timeout in seconds     | 600                                     | 1 回の書き出しの制限時間                                           |
| Keep work directory    | オフ                                    | 生成した Markdown とコピーした画像を残す（調査用）                 |

Dock などから起動した Obsidian は PATH が最小限になるため、ログインシェルの PATH と、よく使われる Node.js のインストール先（Homebrew、Volta、nodebrew、mise、asdf）を自動で補う。

## 開発

```sh
make check         # lint・整形・型・品質ベースライン・テスト・カバレッジ・ビルド
make e2e           # 実際の pfpdf で画像入りノートを PDF にし、画像を検査する（poppler が必要）
make e2e-obsidian  # 隔離した Obsidian でコマンドを実行し、PDF の画像と設定画面を検査する（macOS）
```

`make e2e-obsidian` は別のユーザーデータディレクトリで Obsidian を起動するため、起動中の Obsidian や普段の Vault には触れない。

## ライセンス

MIT
