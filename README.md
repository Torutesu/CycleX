# CycleX

自転車(中古自転車・パーツ)に特化した C2C マーケットプレイスの MVP。

本リポジトリは、別紙1「MVP開発スコープ」に基づく Web アプリケーション一式の開発リポジトリです。
現時点では要件定義フェーズであり、`docs/requirements/` 配下に要件定義書一式を格納しています。

## ドキュメント構成

| ドキュメント | 内容 |
|---|---|
| [00_overview.md](docs/requirements/00_overview.md) | プロジェクト概要・前提・スコープ・対象外・用語定義 |
| [01_functional.md](docs/requirements/01_functional.md) | 機能要件詳細(FR-01〜FR-14) |
| [02_screens.md](docs/requirements/02_screens.md) | 画面一覧・画面遷移・UI/UX 方針(スマホファースト) |
| [03_data_model.md](docs/requirements/03_data_model.md) | データモデル(ER 図・テーブル定義) |
| [04_tech_stack.md](docs/requirements/04_tech_stack.md) | 技術スタック・外部サービス選定 |
| [05_non_functional.md](docs/requirements/05_non_functional.md) | 非機能要件 |
| [06_development_plan.md](docs/requirements/06_development_plan.md) | 開発計画・工数配分(160h)・受入基準 |

## 基本方針

- **スマホファースト**: 全画面をモバイル(375px 基準)で設計し、PC はレスポンシブで対応
- **対応ブラウザ**: 最新版 Chrome / Safari / Edge
- **ユーザー種別**: 出品者・購入者・運営管理者(出品者と購入者は同一アカウントで兼任可能)
- **想定稼働**: 合計 160 時間程度の MVP スコープ
