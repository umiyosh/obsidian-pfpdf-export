# pfpdf Export

[English](README.md)

Obsidian のノートを [pfpdf](https://github.com/pfnet-research/pfpdf) で組版し、表紙・目次付きの PDF に書き出すプラグイン。ノートに埋め込んだ画像（サイズ指定、HTML の `<img>`、リモート画像を含む）は PDF に入る。

pfpdf を別のプログラムとして起動するため、デスクトップ版（Windows、macOS、Linux）専用。

## 必要なもの

- Obsidian 1.13.0 以降（デスクトップ版）
- [Node.js](https://nodejs.org/) 22.12 以降
- 自分でインストールした pfpdf 0.3.0（下記）。プラグインは pfpdf もブラウザも、ほかの何もダウンロード・インストールしない

### pfpdf のインストール

1. npm で pfpdf をインストールする

   ```sh
   npm install -g @pfnet-research/pfpdf@0.3.0
   ```

2. ターミナルで Markdown ファイルを 1 回変換する。pfpdf は最初の変換で、PDF の描画に使う Chromium（数百 MB）をダウンロードし、以後はキャッシュを使う。これが済むまで、プラグインは書き出しをしない

   ```sh
   pfpdf --input hello.md --output hello.pdf
   ```

   `hello.md` は何でもよい（例: `# Hello` とだけ書いたファイル）。

3. 準備ができたか確かめる。`browser` の項目が `pass` になっていればよい

   ```sh
   pfpdf --doctor
   ```

Linux では Chromium 用のシステムライブラリも要る。足りないものは `pfpdf --doctor` が示す。[pfpdf のトラブルシューティング](https://github.com/pfnet-research/pfpdf/blob/main/docs/tutorial.en/08_troubleshooting.md)も参照。

## インストール

**設定 → コミュニティプラグイン → 閲覧** で **pfpdf Export** を検索し、**インストール** と **有効化** を選ぶ。

手動で入れる場合は、[最新のリリース](https://github.com/umiyosh/obsidian-pfpdf-export/releases/latest)から `main.js` と `manifest.json` をダウンロードして `<Vault>/.obsidian/plugins/pfpdf-export/` に置き、Obsidian を再読み込みして **設定 → コミュニティプラグイン** で **pfpdf Export** を有効にする。

## 使い方

- コマンドパレットで **Export current note to PDF** を実行する
- またはファイルエクスプローラーでノートを右クリックし **Export to PDF with pfpdf** を選ぶ

Obsidian を起動してから最初の書き出しの前に、`pfpdf --doctor` で pfpdf とブラウザの準備ができているかを確かめる。できていなければ、書き出さずに何をすればよいかを通知する。設定画面の **Check pfpdf** も同じ確認をする。

テンプレートや目次は、ノートの front matter で指定できる。

```yaml
---
title: 四半期報告書
author: 山田 太郎
template: technical
toc: true
---
```

pfpdf が使うキー（`title`、`author`、`series`、`template`、`toc`、`date`、`page_size`、`lang`、`dir`、`confidential`、`logo`、`bibliography`）だけを型を確かめて渡す。`tags` などほかのキーは無視する。`title` が無ければノート名を使う。`logo` と `bibliography` には Vault 内のファイルのパスを書く。

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
- HEIC / TIFF 画像は Chromium が描画できない。PNG か JPEG に変換する
- 数式の構文に誤りがあると、pfpdf は PDF を作らずに失敗する。本文で `$` を使うときは `\$` と書く

## 設定

| 設定                   | 既定値         | 内容                                                               |
| ---------------------- | -------------- | ------------------------------------------------------------------ |
| Default template       | `default`      | front matter に `template` が無いときのテンプレート                |
| Table of contents      | オン           | front matter に `toc` が無いときの目次の有無                       |
| Save location          | Ask every time | 保存ダイアログで選ぶ／ノートと同じフォルダ／Vault 内の指定フォルダ |
| Open after export      | オン           | 書き出した PDF を OS の既定のアプリで開く                          |
| Pfpdf command          | `pfpdf`        | pfpdf を起動するコマンド。「Check pfpdf」で書き出せるかを確かめる  |
| Extra arguments        | なし           | pfpdf に毎回渡す引数（例: `--host-fonts`）                         |
| Additional search path | なし           | Node.js や pfpdf が見つからないときに足す PATH                     |
| Timeout in seconds     | 600            | 1 回の書き出しの制限時間                                           |
| Keep work directory    | オフ           | 生成した Markdown とコピーした画像を残す（調査用）                 |

Dock やスタートメニューから起動した Obsidian は PATH が最小限になるため、ログインシェルの PATH と、よく使われる Node.js のインストール先（Homebrew、Volta、nodebrew、mise、asdf）を自動で補う。

**Pfpdf command** は `npx @pfnet-research/pfpdf@0.3.0` などに変えてもよい。そのコマンドは設定したとおりに実行されるので、パッケージをダウンロードするかどうかは利用者の選択になる。

## 開示事項

**ネットワーク通信**

- 書き出すノートの中のリモート画像（`http` / `https` の URL）を、PDF に埋め込むために Obsidian の `requestUrl` でダウンロードする。1 件あたり 30 秒で打ち切る。ほかのデータは送らない
- ダウンロードに失敗した画像は URL のまま pfpdf に渡すので、pfpdf のブラウザがその URL を読みに行くことがある。ノート内の raw HTML が参照するリモートのリソースも、pfpdf のブラウザが読み込むことがある
- プラグイン自身は pfpdf、Chromium、そのほかのコードをダウンロードしない。pfpdf が Chromium をダウンロードするのは、[pfpdf のインストール](#pfpdf-のインストール)の手順で利用者が最初の変換を実行したときだけ

**Vault 外のファイル**

- 書き出しのたびに OS の一時フォルダに作業ディレクトリを作り、ノートの画像をコピーし、終わったら消す（**Keep work directory** がオンなら残す）
- **Save location** が **Ask every time** のときは、Vault の外を含む任意の場所に PDF を保存できる
- **Open after export** がオンのときは、PDF を OS の既定の PDF ビューアで開く

**外部プログラムの起動**

- pfpdf（**Pfpdf command** の設定）を別プロセスとして起動する。確認には `--doctor`、書き出しには `--input` と `--output` を付ける
- macOS と Linux では、PATH を読むためにログインシェル（`$SHELL -ilc`）を Obsidian の起動中に 1 回だけ実行する。このときシェルの起動ファイルが読み込まれる

**その他**

- テレメトリは無い。アカウントや支払いは要らない

**セキュリティ上の注意**

pfpdf はノート内の raw HTML を描画し、`<script>` を実行する（[pfpdf のセキュリティ方針](https://github.com/pfnet-research/pfpdf/blob/main/SECURITY.md)）。出所の分からないノートは書き出さない。

## クレジット

- 組版は [pfpdf](https://github.com/pfnet-research/pfpdf)（pfnet-research、MIT License）が行う。pfpdf はバンドルしておらず、利用者がインストールする
- `main.js` には [cross-spawn](https://github.com/moxystudio/node-cross-spawn) とその依存（MIT / ISC License）をバンドルしている。ライセンスの全文は `main.js` の先頭にある

## 開発に参加する

[CONTRIBUTING.md](CONTRIBUTING.md) を参照。

## ライセンス

[MIT](LICENSE)
