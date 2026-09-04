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

前提: Node.js 22 以上、pnpm、Docker

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

| 用途                      | URL                    |
| ------------------------- | ---------------------- |
| アプリ                    | http://localhost:3000  |
| Supabase API              | http://127.0.0.1:54321 |
| 送信メールの確認(Mailpit) | http://127.0.0.1:54324 |

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

評価の14日自動公開、未決済取引の掃除(Stripe 側のセッション失効を含む)、取引と商品の状態ズレの検出、保存されなかった画像の回収を行います。

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

## 環境変数

`.env.example` を参照してください。本番(Vercel)にも同じキーを設定します。

| 変数                                                         | 用途                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                                        | メール本文・OAuth リダイレクトの絶対 URL                                                                           |
| `PLATFORM_FEE_RATE`                                          | 販売手数料率(**表示のみ**。精算処理は対象外)                                                                       |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | クライアント用                                                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | サーバー専用。`src/lib/supabase/admin.ts` からのみ参照                                                             |
| `SUPABASE_DB_URL`                                            | `supabase db push` 用の direct connection                                                                          |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                | 決済                                                                                                               |
| `RESEND_API_KEY` / `EMAIL_FROM`                              | メール送信                                                                                                         |
| `CRON_SECRET`                                                | `/api/cron/daily` の保護                                                                                           |
| `ALLOW_DEMO_CHECKOUT`                                        | `1` で Stripe 未構成時にデモ決済を有効化(ローカル・Preview 用。本番では無効化され、設定していると起動時に失敗する) |
| `NEXT_PUBLIC_NOINDEX`                                        | `1` で `robots.txt` を全面拒否(関係者限定の検証公開の間だけ)                                                       |

本番(`VERCEL_ENV=production`)では起動時に必須の環境変数を検証し、欠落やダミー値(`sk_test_xxx` など)があれば起動を止めます(`src/lib/env.ts`)。

## デプロイ手順

詳細は [docs/DEPLOY.md](docs/DEPLOY.md)。要点は次のとおり。

1. **Supabase**(本番プロジェクト・Tokyo リージョン)
   - `supabase/setup-hosted.sql` を SQL Editor に貼って一度だけ実行する(`scripts/gen-setup-hosted.mjs` で生成。手で編集しない)。以後の変更は `supabase link` → `pnpm db:push`
   - Authentication の設定は下記「本番 Supabase の設定項目一覧」を漏れなく行う
   - Storage に `listing-images` / `avatars` バケットが作成されていることを確認

2. **Google OAuth**(甲名義の Google Cloud プロジェクト)
   - 承認済みリダイレクト URI に `https://<supabase-ref>.supabase.co/auth/v1/callback` を追加

3. **Stripe**
   - テストモードのまま運用(本番切替は甲の審査完了後)
   - Webhook エンドポイントに `https://<本番ドメイン>/api/webhooks/stripe` を登録
   - 購読イベント: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.dispute.created`, `charge.refunded`
   - 署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定

4. **Resend**
   - 送信ドメインを追加し、DNS(SPF / DKIM)を設定。`EMAIL_FROM` はそのドメインのアドレスにする

5. **Vercel**
   - 本番ブランチは `main`。リポジトリを接続し、環境変数をすべて設定(`ALLOW_DEMO_CHECKOUT` は本番に入れない)
   - `vercel.json` の Cron(毎日 JST 4:00)とリージョン(`hnd1`)が反映されることを確認

### 本番 Supabase の設定項目一覧(Authentication)

`supabase/config.toml` はローカル専用で、ホスティング側には反映されない。ダッシュボードで以下を設定する。

| 項目                                | 場所                              | 値                                                                                                                                              |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Site URL                            | URL Configuration                 | `https://<本番ドメイン>`                                                                                                                        |
| Redirect URLs                       | URL Configuration                 | `https://<本番ドメイン>/auth/callback`                                                                                                          |
| メール確認を必須にする              | Providers → Email → Confirm email | ON                                                                                                                                              |
| Secure email change(新旧両方に確認) | Providers → Email                 | ON(設定画面の文言と合わせる)                                                                                                                    |
| パスワード要件                      | Providers → Email → Password      | 8 文字以上、英字と数字を含む                                                                                                                    |
| メールテンプレート                  | Emails → Templates                | 確認・再設定・メール変更のリンクを `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=...` 形式にする(別端末でメールを開いても通る) |
| OTP の有効期限                      | Providers → Email                 | 3600 秒(1 時間)                                                                                                                                 |
| SMTP                                | Project Settings → Auth → SMTP    | Resend など外部 SMTP を設定(既定の送信は日次上限が厳しい)                                                                                       |
| Google プロバイダ                   | Providers → Google                | Client ID / Secret を設定、Skip nonce check は OFF                                                                                              |
| セッションの上限                    | Sessions(Pro プラン)              | 30 日(要件 FR-01-3。Free プランでは設定不可のため要件側で合意する)                                                                              |

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
