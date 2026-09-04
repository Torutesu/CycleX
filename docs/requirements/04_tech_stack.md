# 04. 技術スタック・外部サービス

160 時間の MVP スコープで最大の機能を実装するため、マネージドサービスを最大限活用し、自前実装を最小化する構成とする。

## 1. 技術構成一覧

| レイヤ                 | 採用技術                                                                                                                                | 選定理由                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| フレームワーク         | **Next.js 16(App Router)+ TypeScript**                                                                                                  | フロント/バックエンドを単一コードベースで実装。SSR で商品ページの初期表示を高速化。Vercel と組み合わせてインフラ工数ほぼゼロ          |
| UI                     | **Tailwind CSS + shadcn/ui**                                                                                                            | 既製 UI コンポーネントライブラリ要件(FR-14)に合致。モバイルファーストのユーティリティ設計                                             |
| DB / 認証 / ストレージ | **Supabase**(PostgreSQL / Auth / Storage)                                                                                               | 認証(メール+パスワード、Google OAuth、パスワードリセット、メール確認)・画像ストレージ・RLS を標準提供し、FR-01 の大半を実装不要にする |
| 決済                   | **Stripe(Checkout + Webhook)**                                                                                                          | 決済代行 1 社要件。ホスト型決済ページによりカード情報非保持・PCI DSS 対応を委譲                                                       |
| メール                 | **Resend**                                                                                                                              | トランザクションメール送信。React Email によるテンプレート管理                                                                        |
| 画像処理               | ブラウザで縮小(商品: 長辺 1920px / アイコン: 正方形 512px)→ Supabase Storage に保存 → `next/image` で配信サイズを最適化                 | Storage の画像変換は有料プラン限定のため使わない(ADR #5)。原本サイズの画像を配信・変換に流さない                                      |
| ホスティング           | **Vercel**                                                                                                                              | Next.js 最適化、プレビュー環境自動生成                                                                                                |
| バリデーション         | Zod                                                                                                                                     | フォーム/API の入出力スキーマを共通化                                                                                                 |
| フォーム               | 独自の `Field` コンポーネント + Zod(blur 時のインライン検証 + Server Action の検証)                                                     | react-hook-form は使わない(Server Action と併用しやすい軽量な構成)                                                                    |
| データ取得             | Server Components + Server Actions(必要箇所のみ SWR)                                                                                    |                                                                                                                                       |
| テスト                 | Vitest(純粋ロジック: 取引遷移・Webhook 判定・バリデーション・認可判定 等)+ Playwright E2E(登録・出品・検索・メッセージ・デモ決済・管理) | 160h 内で費用対効果の高い範囲に限定                                                                                                   |
| Lint / Format          | ESLint + Prettier                                                                                                                       |                                                                                                                                       |
| CI                     | GitHub Actions(lint / typecheck / unit test)                                                                                            |                                                                                                                                       |

## 2. 環境

| 環境                 | 用途                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| local                | 開発(Supabase CLI ローカル or 開発プロジェクト、Stripe テストモード) |
| preview              | PR ごとの Vercel Preview(Supabase 開発プロジェクト共用)              |
| production(検証環境) | 事業検証用本番。Stripe は検証段階に応じテスト/本番モードを切替       |

## 3. 外部サービスと責任分界

| サービス     | 利用範囲                                                                        | 備考                                                                                              |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Supabase     | Auth(メール確認・Google OAuth・リセット)、Postgres、Storage(商品画像・アイコン) | 無料〜Pro プラン。アカウントは甲名義で作成し乙が構築                                              |
| Stripe       | Checkout によるカード決済、Webhook                                              | **Connect・返金 API・送金は使用しない**(標準機能の範囲内)。返金等は運営がダッシュボードで手動対応 |
| Resend       | メール送信                                                                      | 送信ドメイン(DNS 設定)は甲が用意するドメインで設定                                                |
| Google Cloud | OAuth クライアント(Google ログイン用)                                           | 甲名義プロジェクト                                                                                |
| Vercel       | ホスティング                                                                    | 甲名義アカウント                                                                                  |

※ 各 SaaS の利用料金・アカウント契約は甲負担。乙は構築・設定を行う。

## 4. リポジトリ構成(想定)

```
CycleX/
├── docs/requirements/        # 本要件定義書
├── src/
│   ├── app/                  # Next.js App Router(公開/会員/admin/api)
│   │   ├── (public)/         # ホーム・検索・商品詳細・プロフィール
│   │   ├── (auth)/           # signup/login/reset
│   │   ├── (member)/         # sell/mypage/messages/transactions
│   │   ├── admin/            # 管理画面
│   │   └── api/              # Route Handlers(Stripe Webhook 等)
│   ├── components/           # UI コンポーネント(shadcn/ui ベース)
│   ├── lib/                  # supabase/stripe/resend クライアント、定数(カテゴリ等)
│   ├── features/             # ドメインロジック(listing/transaction/review 等)
│   └── emails/               # メールテンプレート
├── supabase/
│   ├── migrations/           # DDL・RLS ポリシー
│   └── seed.sql              # ブランドマスタ・管理者シード
└── e2e/                      # Playwright スモーク
```

## 5. セキュリティ実装方針(スコープ内の標準対策)

※ 脆弱性診断・監査は対象外だが、フレームワーク標準の対策は実装に含める。

- 認証: Supabase Auth(HttpOnly Cookie セッション)。管理画面はミドルウェアで role='admin' を検証
- 認可: RLS + サーバーサイドでの所有者/状態チェックの二重化
- CSRF: Server Actions の同一オリジン検証(Next.js 標準)
- XSS: React の自動エスケープ。ユーザー入力の HTML 描画はしない
- Stripe Webhook: 署名検証必須。冪等処理(session_id の UNIQUE 制約)
- 画像アップロード: MIME/サイズ検証、推測不能なストレージパス
- レート制限: 認証・メッセージ送信・通報に簡易レート制限(ミドルウェア)
- 秘密情報: すべて環境変数管理。リポジトリにコミットしない
