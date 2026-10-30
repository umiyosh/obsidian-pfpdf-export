NPM ?= npm

.DEFAULT_GOAL := help

.PHONY: help install lint fmt fmt-check typecheck test test-coverage quality-test lint-quality quality-baseline build e2e e2e-obsidian check

help: ## 利用可能なターゲットを表示する。
	@perl -ne 'if (/^([A-Za-z0-9_.-]+):.*?##\s*(.+)$$/) { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## 依存関係を取得する。
	$(NPM) install

lint: ## ESLint（Obsidian 公式ルールを含む）で検査する。
	$(NPM) run lint

fmt: ## Prettier で整形する。
	$(NPM) run fmt

fmt-check: ## 整形状態を検査する。
	$(NPM) run fmt-check

typecheck: ## TypeScript の型を検査する。
	$(NPM) run typecheck

test: ## ユニットテストを実行する。
	$(NPM) run test:run

test-coverage: ## カバレッジゲート（80%）を実行する。
	$(NPM) run test:coverage

quality-test: ## 品質ベースライン判定ロジックをテストする。
	$(NPM) run quality:test

lint-quality: ## 品質ベースライン（複雑度・行数・未使用コード）を検査する。
	$(NPM) run quality:check

quality-baseline: ## 現在の品質違反からベースラインを更新する（悪化方向の更新は拒否される）。
	$(NPM) run quality:update-baseline

build: ## プラグイン（main.js）をビルドする。
	$(NPM) run build

e2e: ## 実際の pfpdf で画像入りノートを PDF にし、画像が入っているかを検査する（poppler が必要）。
	$(NPM) run test:e2e

e2e-obsidian: build ## 隔離した Obsidian（macOS）でノートを PDF にし、画像が入っているかを検査する。
	node scripts/e2e-obsidian.mjs

check: lint fmt-check typecheck quality-test lint-quality test test-coverage build ## ローカル CI 相当の全チェックを実行する。
