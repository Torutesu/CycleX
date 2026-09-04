# CycleX

自転車(中古車体・パーツ)に特化した C2C マーケットプレイスの MVP。

- **スマホファースト**(375px 基準)で設計し、PC はレスポンシブ対応
- 対応ブラウザ: 最新版 Chrome / Safari / Edge(iOS Safari・Android Chrome を含む)
- ユーザー種別: 出品者・購入者(同一アカウントで兼任)・運営管理者

## 技術構成

| レイヤ           | 採用                                                      |
| ---------------- | --------------------------------------------------------- |
| アプリ           | Next.js 16(App Router / Turbopack)+ React 19 + TypeScript |
| UI               | Tailwind CSS v4 + shadcn/ui                               |
| DB / 認証 / 画像 | Supabase(PostgreSQL / Auth / Storage)                     |
| 決済             | Stripe Checkout + Webhook                                 |
| メール           | Resend                                                    |
| ホスティング     | Vercel(日次バッチは Vercel Cron)                          |
| テスト           | Vitest(ユニット)/ Playwright(E2E スモーク)                |

## セットアップ(ローカル)

前提: Node.js 20.9 以上、pnpm、Docker

```bash
pnpm install

# Supabase をローカル起動(初回はイメージ取得に数分かかる)
pnpm db:start

# 出力された ANON_KEY / SERVICE_ROLE_KEY を .env.local に設定する
cp .env.example .env.local

# 型を生成
pnpm db:types

pnpm dev            # http://localhost:3000
```

### よく使うコマンド

```bash
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest(ユニット)
pnpm test:e2e       # Playwright(E2E スモーク)
pnpm build          # 本番ビルド

pnpm db:reset       # マイグレーション再適用 + シード
pnpm db:types       # src/types/database.ts を再生成
```

### ローカルで使えるもの

| 用途                       | URL                    |
| -------------------------- | ---------------------- |
| アプリ                     | http://localhost:3000  |
| Supabase API               | http://127.0.0.1:54321 |
| 送信メールの確認(Inbucket) | http://127.0.0.1:54324 |

### 開発用データの投入

```bash
node scripts/seed-dev.mjs 500   # ダミー商品を 500 件作成
```

### 管理者アカウントの作成

管理画面(`/admin`)は `users.role = 'admin'` のユーザーのみアクセスできます。
管理画面上での管理者追加 UI は MVP の対象外のため、DB を直接更新してください。

```sql
update public.users set role = 'admin' where email = 'admin@example.com';
```

### Stripe Webhook のローカル検証

決済の確定は Webhook のみを正としています。Stripe CLI で転送してください。

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# 表示された whsec_... を .env.local の STRIPE_WEBHOOK_SECRET に設定する
```

テストカードは `4242 4242 4242 4242`(有効期限は未来の任意日、CVC は任意の3桁)。

### 日次バッチの手動実行

評価の14日自動公開と、未決済取引の掃除を行います。

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

## 環境変数

`.env.example` を参照してください。本番(Vercel)にも同じキーを設定します。

| 変数                                                         | 用途                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                                        | メール本文・OAuth リダイレクトの絶対 URL               |
| `PLATFORM_FEE_RATE`                                          | 販売手数料率(**表示のみ**。精算処理は対象外)           |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | クライアント用                                         |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | サーバー専用。`src/lib/supabase/admin.ts` からのみ参照 |
| `SUPABASE_DB_URL`                                            | `supabase db push` 用の direct connection              |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                | 決済                                                   |
| `RESEND_API_KEY` / `EMAIL_FROM`                              | メール送信                                             |
| `CRON_SECRET`                                                | `/api/cron/daily` の保護                               |

## デプロイ手順

1. **Supabase**(本番プロジェクト)
   - `supabase link --project-ref <ref>` → `pnpm db:push`
   - `supabase/seed.sql` のブランドマスタを投入
   - Authentication → URL Configuration に本番ドメインと `/auth/callback` を登録
   - Authentication → Providers → Google を有効化(Client ID / Secret を設定)
   - Storage に `listing-images` / `avatars` バケットが作成されていることを確認

2. **Google OAuth**(甲名義の Google Cloud プロジェクト)
   - 承認済みリダイレクト URI に `https://<supabase-ref>.supabase.co/auth/v1/callback` を追加

3. **Stripe**
   - テストモードのまま運用(本番切替は甲の審査完了後)
   - Webhook エンドポイントに `https://<本番ドメイン>/api/webhooks/stripe` を登録
   - 購読イベント: `checkout.session.completed`, `checkout.session.expired`
   - 署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定

4. **Resend**
   - 送信ドメインを追加し、DNS(SPF / DKIM)を設定
   - 検証が完了するまでは Resend のテスト用ドメインで送信される

5. **Vercel**
   - リポジトリを接続し、環境変数をすべて設定
   - `vercel.json` の Cron(毎日 JST 4:00)が登録されることを確認

## ドキュメント

### 要件定義(`docs/requirements/`)

| ドキュメント                                                       | 内容                                   |
| ------------------------------------------------------------------ | -------------------------------------- |
| [00_overview.md](docs/requirements/00_overview.md)                 | 目的・前提・スコープ・対象外・用語定義 |
| [01_functional.md](docs/requirements/01_functional.md)             | 機能要件(FR-01〜FR-14)                 |
| [02_screens.md](docs/requirements/02_screens.md)                   | 画面一覧・遷移・UI/UX 方針             |
| [03_data_model.md](docs/requirements/03_data_model.md)             | データモデル                           |
| [04_tech_stack.md](docs/requirements/04_tech_stack.md)             | 技術スタック・外部サービス             |
| [05_non_functional.md](docs/requirements/05_non_functional.md)     | 非機能要件                             |
| [06_development_plan.md](docs/requirements/06_development_plan.md) | 開発計画・受入基準                     |

### 実装計画・記録(`docs/plan/`)

| ドキュメント                                                                                                       | 内容                              |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| [00_execution_guide.md](docs/plan/00_execution_guide.md)                                                           | 実行ガイド・ADR・ディレクトリ構成 |
| [01_bootstrap.md](docs/plan/01_bootstrap.md) 〜 [08_notifications_polish.md](docs/plan/08_notifications_polish.md) | フェーズ別の実装計画              |
| [ACCEPTANCE_RESULT.md](docs/plan/ACCEPTANCE_RESULT.md)                                                             | 受入テストの実施結果              |
| [RESPONSIVE_CHECK.md](docs/plan/RESPONSIVE_CHECK.md)                                                               | レスポンシブ点検の結果            |
| [BACKLOG.md](docs/plan/BACKLOG.md)                                                                                 | スコープ外の改善候補              |

### レビュー(`docs/review/`)

| ドキュメント                                         | 内容                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| [COMPLETION_PLAN.md](docs/review/COMPLETION_PLAN.md) | プロダクト完成に向けた総合レビュー・要件との乖離一覧・実装計画(最新) |
| [CODE_REVIEW.md](docs/review/CODE_REVIEW.md)         | 前回のコードレビューと対応記録                                       |
| [DB_VERIFICATION.md](docs/review/DB_VERIFICATION.md) | マイグレーションの実 PostgreSQL 検証結果                             |

## 対象外の機能

別紙1 第3項に基づき、以下は本 MVP に含まれません。

- 売上金の出品者への送金、エスクロー、返金処理(運営が Stripe ダッシュボードで対応)
- 配送業者 API 連携、送り状発行、配送追跡
- 本人確認(eKYC)、年齢確認、防犯登録の照会
- 規約・プライバシーポリシーの文面作成(掲載枠のみ実装)
- ネイティブアプリ、多言語・多通貨対応
- 負荷試験、脆弱性診断、リリース後の運用・監視
