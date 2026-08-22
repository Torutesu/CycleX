# 実装計画 00. 実行ガイド(自律エージェント向け)

本ディレクトリは CycleX MVP の**実装計画書**である。`docs/requirements/` の要件定義を実装可能なタスクに分解しており、自律エージェント(Goal モード)がフェーズ順に実行することを前提とする。

## 1. 実行順序

| Phase | ファイル | 内容 | 目安 |
|---|---|---|---|
| 1 | [01_bootstrap.md](01_bootstrap.md) | プロジェクト雛形・DB スキーマ・RLS・シード・CI | 20h |
| 2 | [02_auth_profile.md](02_auth_profile.md) | 認証(FR-01)・プロフィール(FR-02)・共通レイアウト | 20h |
| 3 | [03_listings.md](03_listings.md) | 出品(FR-03)・画像アップロード | 22h |
| 4 | [04_search_favorites.md](04_search_favorites.md) | 検索・一覧(FR-04)・商品詳細(FR-05)・お気に入り(FR-06) | 26h |
| 5 | [05_messages.md](05_messages.md) | メッセージ(FR-07) | 12h |
| 6 | [06_transactions.md](06_transactions.md) | 取引(FR-08)・決済(FR-09)・評価(FR-10) | 30h |
| 7 | [07_admin.md](07_admin.md) | 通報(FR-11)・管理画面(FR-12) | 18h |
| 8 | [08_notifications_polish.md](08_notifications_polish.md) | メール通知(FR-13)・レスポンシブ仕上げ・E2E・デプロイ | 12h |

- フェーズは順番に実施する。フェーズ内タスク(T-x.y)も原則記載順
- 各フェーズ末尾の「フェーズ完了条件」をすべて満たしてから次へ進む
- 仕様の疑義は `docs/requirements/` を正とする。計画と要件が矛盾する場合は要件を優先し、計画側の記述を修正コミットする

## 2. グラウンドルール

### コミット規約

- Conventional Commits: `feat:` / `fix:` / `chore:` / `docs:` / `test:`(スコープ例: `feat(listing): 出品フォーム実装`)
- タスク単位(T-x.y)でコミット。フェーズ完了時に検証コマンド全通過を確認してから push

### 品質ゲート(全フェーズ共通)

コミット前に必ず以下がゼロエラーで通ること:

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest(該当フェーズのテスト含む)
pnpm build         # next build
```

### コーディング規約

- TypeScript strict。`any` 禁止(やむを得ない場合は `unknown`+絞り込み)
- ページは Server Component をデフォルトとし、インタラクションが必要な葉のみ `"use client"`
- **すべての書き込みは Server Action**(`src/features/*/actions.ts`)で行い、冒頭で (1) Zod による入力検証 (2) 認証・認可・状態遷移ガードの検証 を必ず行う
- `SUPABASE_SERVICE_ROLE_KEY` を使うモジュールは `import "server-only"` を必ず宣言し、`src/lib/supabase/admin.ts` のみに限定
- UI 文言・エラーメッセージはすべて日本語。定数(カテゴリ等)は `src/lib/constants.ts` に一元化
- スマホファースト: Tailwind はモバイル基準で書き、`sm:` `md:` `lg:` で PC へ展開。タップターゲット 44px 以上

### やらないこと(スコープ逸脱の防止)

- 返金 API・Stripe Connect・送金・エスクロー実装
- 配送業者連携、eKYC、リアルタイム同期(WebSocket/Realtime)
- 多言語化、アクセシビリティ専用対応、独自ログ基盤
- 要件にない機能追加(気づきは `docs/plan/BACKLOG.md` に追記するだけに留める)

## 3. アーキテクチャ決定(ADR 要約)

| # | 決定 | 理由 |
|---|---|---|
| 1 | Next.js 15 App Router + Server Actions、API Route は Webhook 等の外部起点のみ | 実装量最小化 |
| 2 | 認証は Supabase Auth(`@supabase/ssr` の Cookie セッション)。`public.users` プロフィールは auth.users への INSERT トリガーで自動作成 | FR-01 の大半を委譲 |
| 3 | 認可は「RLS + Server Action 内ガード」の二重化。RLS は閲覧制御中心、状態遷移の正しさはサーバーコードで担保 | 単純化 |
| 4 | 商品検索は pg_trgm(ILIKE + GIN index)。tsvector は使わない | 日本語形態素解析を避ける |
| 5 | 画像は Supabase Storage に原本保存し、配信サイズの調整は `next/image` に任せる(各所で `sizes` を指定)。オフライン変換処理は持たない | 実装ゼロでリサイズ要件を満たす。当初は Storage の画像変換(`render/image`)を想定したが、**Supabase の有料プラン限定機能**でありローカルでも使えないため方針変更 |
| 6 | 決済確定は Stripe Webhook のみを正とする。`checkout.session.expired` で取引を自動キャンセルし商品を公開中へ戻す | 二重購入・宙吊り防止 |
| 7 | 「1商品につき有効取引1件」は部分ユニークインデックスで DB 保証 | 排他制御 |
| 8 | 評価の 14 日自動公開・取引完了は Vercel Cron(日次)+冪等な SQL で処理 | ジョブ基盤を持たない |
| 9 | メールは Resend。送信は `sendMail()` ラッパー経由に統一し、通知設定チェックと email_logs 記録を内包。**送信失敗は業務処理を失敗させない**(ログのみ) | FR-13 |
| 10 | レート制限は DB カウント方式(直近 N 分の行数チェック)。対象: メッセージ送信(10件/分)・通報(5件/時)・出品作成(10件/時) | 外部サービス追加を避ける |

## 4. 環境変数(完全リスト)

`.env.example` に以下を必ず含める:

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
PLATFORM_FEE_RATE=0.10            # 手数料率(表示のみに使用)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only
SUPABASE_DB_URL=                  # supabase db push 用(direct connection)

# Stripe(テストモード)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Resend
RESEND_API_KEY=
EMAIL_FROM="CycleX <noreply@example.com>"

# Cron 保護
CRON_SECRET=
```

## 5. ディレクトリ構成(確定版)

```
src/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                     # S-01 ホーム
│   │   ├── search/page.tsx              # S-02 検索一覧
│   │   ├── items/[id]/page.tsx          # S-03 商品詳細
│   │   ├── users/[id]/page.tsx          # S-04 公開プロフィール
│   │   └── terms/page.tsx ほか静的ページ
│   ├── (auth)/
│   │   ├── signup/page.tsx  login/page.tsx
│   │   ├── verify-email/page.tsx  reset-password/page.tsx
│   │   └── auth/callback/route.ts       # OAuth/確認リンクのコールバック
│   ├── (member)/
│   │   ├── sell/page.tsx  sell/[id]/edit/page.tsx
│   │   ├── items/[id]/purchase/page.tsx
│   │   ├── purchase/complete/page.tsx
│   │   ├── transactions/[id]/page.tsx  transactions/[id]/review/page.tsx
│   │   ├── messages/page.tsx  messages/[threadId]/page.tsx
│   │   └── mypage/…(listings/purchases/favorites/profile/settings)
│   ├── admin/                            # AD-01〜06(独自レイアウト)
│   ├── api/
│   │   ├── webhooks/stripe/route.ts
│   │   └── cron/daily/route.ts           # 評価14日公開・取引完了・期限切れ掃除
│   ├── layout.tsx  globals.css
├── components/
│   ├── ui/                               # shadcn/ui 生成物
│   ├── layout/  (header.tsx, tab-bar.tsx, footer.tsx)
│   └── listing/ (listing-card.tsx, listing-grid.tsx, image-slider.tsx, favorite-button.tsx)
├── features/
│   ├── auth/  profile/  listing/  search/  favorite/
│   ├── message/  transaction/  review/  report/  admin/
│   │   └── 各: actions.ts / queries.ts / schema.ts(Zod)/ 必要なら components/
├── lib/
│   ├── supabase/ (client.ts, server.ts, admin.ts, middleware.ts)
│   ├── stripe.ts  email/(send.ts, templates/)  constants.ts  utils.ts  rate-limit.ts
├── types/ (database.ts = supabase gen types, domain.ts)
supabase/
├── migrations/  seed.sql  config.toml
e2e/  vitest.config.ts  playwright.config.ts  vercel.json
```

## 6. テスト方針

- **Vitest(ユニット)**: 純粋ロジックを対象 — 取引ステータス遷移ガード、Zod スキーマ、検索クエリビルダ、手数料計算、評価公開判定。Supabase はモック不要な設計(ロジックを純関数に切り出す)
- **Playwright(スモーク 1 本)**: Phase 8 で「登録→出品→検索→詳細→お気に入り」のゲスト+会員動線。決済は Webhook 依存のため E2E 対象外(ユニット+手動で担保)
- 各フェーズの「検証」節に手動確認手順を記載。手動確認も完了条件に含む

## 7. 障害時の方針

- 外部サービス(Supabase/Stripe/Resend)起因で進行不能な場合: モック・スタブで先へ進まず、該当タスクを `BLOCKED.md` に記録して他タスクを先行する
- ライブラリのメジャーバージョン差異で計画のコードが合わない場合: 計画の意図(何を実現するか)を優先し、実装は最新 API に合わせる
