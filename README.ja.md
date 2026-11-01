# pfpdf Export

[English](README.md)

[![CI](https://github.com/umiyosh/obsidian-pfpdf-export/actions/workflows/ci.yml/badge.svg)](https://github.com/umiyosh/obsidian-pfpdf-export/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/umiyosh/obsidian-pfpdf-export)](https://github.com/umiyosh/obsidian-pfpdf-export/releases/latest)
[![Obsidian plugin](https://img.shields.io/badge/Obsidian-plugin-7C3AED?logo=obsidian&logoColor=white)](https://community.obsidian.md/plugins/pfpdf-export)
[![License: MIT](https://img.shields.io/github/license/umiyosh/obsidian-pfpdf-export)](LICENSE)

![Obsidian で開いたノートと、pfpdf Export がそのノートから組版した PDF の表紙、目次、本文のページ](https://raw.githubusercontent.com/umiyosh/obsidian-pfpdf-export/master/docs/images/hero.ja.webp)

Obsidian のノートを PDF に書き出すプラグインです。PDF の組版（文字や図の配置）は [pfpdf](https://github.com/pfnet-research/pfpdf) が行い、表紙と目次を付けられます。ノートに埋め込んだ画像は、サイズを指定したもの、HTML の `<img>` で書いたもの、インターネット上の画像も含めて PDF に入ります。

pfpdf を別のプログラムとして起動するので、デスクトップ版の Obsidian（Windows、macOS、Linux）でだけ動きます。

## 必要なもの

- Obsidian 1.13.0 以降（デスクトップ版）
- [Node.js](https://nodejs.org/) 22.12 以降（pfpdf を動かすのに使います）
- ご自身でインストールした pfpdf 0.3.0（手順は次の節にあります）。このプラグインは pfpdf をダウンロードもインストールもしません

### pfpdf をインストールする

ターミナルで次のコマンドを実行し、npm で pfpdf をインストールします。

```sh
npm install -g @pfnet-research/pfpdf@0.3.0
```

最初に PDF を書き出すとき、pfpdf は PDF の描画に使う Chromium（数百 MB）をダウンロードします。2 回目からはダウンロード済みのものを使うので、時間がかかるのは最初の書き出しだけです。

Linux では、Chromium が使うシステムのライブラリも必要です。足りないものは `pfpdf --doctor` で確かめられます。詳しくは [pfpdf のトラブルシューティング](https://github.com/pfnet-research/pfpdf/blob/main/docs/tutorial.en/08_troubleshooting.md)を見てください。

## プラグインのインストール

**設定 → コミュニティプラグイン → 閲覧** で **pfpdf Export** を検索し、**インストール** を押してから **有効化** を押します。

手動で入れる場合は、次の手順で入れます。

1. [最新のリリース](https://github.com/umiyosh/obsidian-pfpdf-export/releases/latest)から `main.js` と `manifest.json` をダウンロードする
2. 2 つのファイルを `<Vault>/.obsidian/plugins/pfpdf-export/` に置く
3. Obsidian を再読み込みし、**設定 → コミュニティプラグイン** で **pfpdf Export** を有効にする

## 使い方

PDF にしたいノートで、次のどちらかを実行します。

- コマンドパレットで **Export current note to PDF** を実行する
- ファイルエクスプローラーでノートを右クリックし、**Export to PDF with pfpdf** を選ぶ

プラグインは書き出す前に `pfpdf --version` を実行し、pfpdf が起動するかを確かめます。起動しないときは書き出さずに、その理由を通知します。pfpdf が見つからないときは、インストールの方法も表示します。設定画面の **Check pfpdf** でも、同じ確認ができます。

### front matter で指定する

テンプレートや目次の有無は、ノートの front matter（ノートの先頭の `---` で囲んだ部分）で指定できます。

```yaml
---
title: 四半期報告書
author: 山田 太郎
template: technical
toc: true
---
```

プラグインが pfpdf に渡すのは、次のキーだけです。`tags` など、ほかのキーは無視します。

- `title`: 書かなければ、ノートの名前を使います
- `author`、`series`、`template`、`toc`、`date`、`page_size`、`lang`、`dir`、`confidential`
- `logo`、`bibliography`: Vault の中のファイルのパスを書きます

値の形が合わないキーは、警告を出して無視します。たとえば `toc` には `true` か `false` を書きます。`template` に知らない名前を書いたときは、警告を出して既定のテンプレートを使います。

## Obsidian 独自の記法の扱い

pfpdf は GitHub Flavored Markdown を組版します。そのため、Obsidian 独自の記法は書き出す前に次のように変換します。

| 記法                                                            | PDF での扱い                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `![[画像.png]]`、`![[画像.png\|300]]`、`![[画像.png\|300x200]]` | 画像。指定したサイズで入れます                                                   |
| `![代替](相対パス.png)`、`![代替](<空白 を含む.png>)`           | 画像。パスはノートのある場所から探します                                         |
| `<img src="相対パス.png">`                                      | 画像                                                                             |
| `![](https://…)`                                                | ダウンロードして画像として入れます。失敗したら URL のまま残し、警告を出します    |
| `![[ノート]]`、`![[ノート#見出し]]`、`![[ノート#^ブロック]]`    | 埋め込んだノートの本文を入れます。ノート同士が互いを埋め込んでいるときは止めます |
| `![[図.excalidraw]]`                                            | Excalidraw プラグインが自動で書き出した SVG か PNG を使います                    |
| `[[リンク\|別名]]`、ノートへの Markdown リンク                  | 表示されている文字だけを残します（pfpdf は文書の外へのリンクを受け付けないため） |
| `> [!note] タイトル`（コールアウト）                            | 色付きの枠                                                                       |
| `==ハイライト==`                                                | ハイライト                                                                       |
| `%%コメント%%`、`^block-id`                                     | 消します                                                                         |
| `^[インライン脚注]`                                             | 脚注                                                                             |
| コードブロック、インラインコード、数式                          | そのまま                                                                         |

### 書き出すときの注意

- `___`（アンダースコア 3 個以上）だけの行は、pfpdf では改ページになります。水平線を引くときは `---` を使ってください
- Dataview など、ほかのプラグインが描画する内容は、描画した結果ではなく、コードブロックに書いたままの形で PDF に出ます。PDF は Obsidian の画面ではなく、ノートの Markdown から組版するためです
- HEIC と TIFF の画像は、Chromium が描画できません。PNG か JPEG に変換してください
- 数式の書き方に誤りがあると、pfpdf は PDF を作らずに失敗します。本文で `$` という文字を使うときは `\$` と書いてください

## 設定

| 設定                   | 既定値         | 内容                                                                           |
| ---------------------- | -------------- | ------------------------------------------------------------------------------ |
| Default template       | `default`      | front matter に `template` がないときに使うテンプレート                        |
| Table of contents      | オン           | front matter に `toc` がないときに、目次を付けるかどうか                       |
| Save location          | Ask every time | 保存先。毎回ダイアログで選ぶ、ノートと同じフォルダ、Vault の中の指定のフォルダ |
| Open after export      | オン           | 書き出した PDF を、OS の既定のアプリで開く                                     |
| Pfpdf command          | `pfpdf`        | pfpdf を起動するコマンド。**Check pfpdf** で起動するかを確かめられる           |
| Extra arguments        | なし           | 毎回 pfpdf に渡す引数（例: `--host-fonts`）                                    |
| Additional search path | なし           | Node.js や pfpdf が見つからないときに、PATH に足すフォルダ                     |
| Timeout in seconds     | 600            | 1 回の書き出しにかけてよい時間（秒）                                           |
| Keep work directory    | オフ           | 書き出しのために作った Markdown とコピーした画像を残す（問題を調べるとき用）   |

Dock やスタートメニューから Obsidian を起動すると、PATH（コマンドを探すフォルダの一覧）にはシステムのフォルダしか入りません。そのままでは Node.js や pfpdf が見つからないので、プラグインはログインシェルの PATH と、Node.js がよくインストールされる場所（Homebrew、Volta、nodebrew、mise、asdf）を自動で足します。

**Pfpdf command** は `npx @pfnet-research/pfpdf@0.3.0` のような別のコマンドに変えてもかまいません。プラグインは設定されたコマンドをそのまま実行します。npx のようにパッケージをダウンロードするコマンドを設定した場合、ダウンロードはご自身が選んだ動作になります。

## 開示事項

### ネットワーク通信

- 書き出すノートにインターネット上の画像（`http` か `https` の URL）があると、PDF に入れるために、Obsidian の `requestUrl` でダウンロードします。1 件につき 30 秒で打ち切ります。画像のダウンロードのほかには、何も送りません
- ダウンロードに失敗した画像は、URL のまま pfpdf に渡します。このとき、pfpdf が使うブラウザ（Chromium）がその URL を読み込むことがあります。ノートに直接書いた HTML が参照するインターネット上のファイルも、同じブラウザが読み込むことがあります
- プラグイン自身は pfpdf もほかのプログラムもダウンロードしません。Chromium をダウンロードするのは、ご自身でインストールした pfpdf です（[pfpdf をインストールする](#pfpdf-をインストールする)を参照）

### Vault の外のファイル

- 書き出すたびに、OS の一時フォルダに作業用のフォルダを作り、ノートの画像をそこへコピーします。書き出しが終わったら、そのフォルダを消します。**Keep work directory** がオンのときは残します
- **Save location** が **Ask every time** のときは、Vault の外も含めて、どこにでも PDF を保存できます
- **Open after export** がオンのときは、書き出した PDF を OS の既定の PDF ビューアで開きます

### 外部プログラムの起動

- pfpdf（**Pfpdf command** に設定したコマンド）を、別のプロセスとして起動します。確かめるときは `--version` を、書き出すときは `--input` と `--output` を付けます
- macOS と Linux では、PATH を読み取るために、ログインシェル（`$SHELL -ilc`）を Obsidian の起動中に 1 回だけ実行します。このとき、シェルの起動ファイルが読み込まれます

### そのほか

- テレメトリー（利用状況の収集）はありません。アカウントも支払いも要りません

### セキュリティ上の注意

pfpdf はノートに直接書いた HTML を描画し、`<script>` も実行します（[pfpdf のセキュリティ方針](https://github.com/pfnet-research/pfpdf/blob/main/SECURITY.md)）。出所の分からないノートは、書き出さないでください。

## クレジット

- 組版は [pfpdf](https://github.com/pfnet-research/pfpdf)（pfnet-research、MIT License）が行います。pfpdf はこのプラグインに含まれておらず、利用する方がご自身でインストールします
- `main.js` には [cross-spawn](https://github.com/moxystudio/node-cross-spawn) とそれが依存するパッケージ（MIT / ISC License）が含まれています。ライセンスの全文は `main.js` の先頭にあります

## 開発に参加する

[CONTRIBUTING.md](CONTRIBUTING.md) を見てください。

## ライセンス

[MIT](LICENSE)
