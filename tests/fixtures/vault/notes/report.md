---
title: 画像エクスポートの検証
author:
  - 検証 太郎
template: technical
tags:
  - test
cssclasses: wide
---

# 画像エクスポートの検証

## wiki 形式

![[photo.png]]

サイズ指定: ![[wide.png|300]]

日本語と空白を含む名前: ![[日本語 の画像.jpg]]

## Markdown 形式

相対パス: ![図](figures/diagram.svg)

山括弧: ![日本語](<../attachments/日本語 の画像.jpg>)

## HTML

<img src="figures/diagram.svg" width="160" alt="html">

## リモート

![remote]({{REMOTE}}/remote.png)

## 埋め込み

![[part#共有する節]]

> [!tip] callout の中の画像
> ![[photo.png|120]]

==ハイライト== と [[part|内部リンク]] と %%コメント%% と `![[photo.png]]`
