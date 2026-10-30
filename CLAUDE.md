# CLAUDE.md

pfpdf（https://github.com/pfnet-research/pfpdf）で Obsidian のノートを PDF に出力するデスクトップ専用プラグイン。

## 品質ゲート

kotobae の TypeScript 側の品質ゲートを移植している。変更後は次を通す。

```sh
make check
```

`make check` は ESLint（`eslint-plugin-obsidianmd` の推奨規則を含む）、Prettier、TypeScript、品質ベースライン判定ロジックのテスト、品質ベースライン（複雑度・ネスト・行数・引数・knip の未使用コード）、Vitest、カバレッジ（80%）、ビルドを順に実行する。

- 新しい品質違反を追加しない。`quality-baseline.json` は違反 0 件から始めており、悪化方向へ更新しない（`make quality-baseline` は悪化を拒否する）
- 型エラーを `any` や型の強制変換で回避しない
- 振る舞いの変更は失敗するテストから始める
- コメントには処理の言い換えではなく理由を書く

## 画像出力の検証

利用者が観測する出力（PDF）を変えたら、`make check` に加えて次も通す。

```sh
make e2e           # 実際の pfpdf で fixture ノートを PDF にし、pdfimages / pdftotext で画像を検査する
make e2e-obsidian  # 隔離した Obsidian（別のユーザーデータディレクトリ）でコマンドを実行して検査する（macOS）
```

どちらも Chromium を起動するため sandbox 外で実行する。
