# Phase 8: メール通知・仕上げ・E2E・デプロイ(12h)

ゴール: FR-13 の全メールが送信され、レスポンシブ・空状態・エラーの仕上げが済み、E2E スモークが通り、検証環境にデプロイされる。

## T-8.1 メール基盤 `src/lib/email/`

- `send.ts#sendMail({ to, userId, kind, subject, react })`:
  1. `kind` が任意通知(下表 optional=true)なら `users.notification_prefs[kind] !== false` を確認(デフォルト ON)
  2. 宛先ユーザーが withdrawn/suspended なら送らない(認証系を除く)
  3. Resend で送信 → email_logs に sent/failed 記録。**throw しない**(失敗しても業務処理は成功させる)
- テンプレート(`templates/`、react-email。共通レイアウト: ロゴテキスト+本文+CTA ボタン+フッター):

| kind                | 宛先   | 件名(例)                     | optional    |
| ------------------- | ------ | ---------------------------- | ----------- |
| listing_paid_seller | 出品者 | 商品が購入されました         | ○           |
| purchase_confirmed  | 購入者 | ご購入ありがとうございます   | ○           |
| tx_shipped          | 購入者 | 発送・受渡のご連絡があります | ○           |
| tx_received         | 出品者 | 受取確認のお知らせ           | ○           |
| review_requested    | 相手方 | 評価のお願い                 | ○           |
| review_received     | 相手方 | 評価が届きました             | ○           |
| tx_completed        | 双方   | 取引が完了しました           | ○           |
| tx_canceled         | 双方   | 取引がキャンセルされました   | ×(必ず送る) |
| new_message         | 受信者 | 新着メッセージがあります     | ○           |

- 認証系(確認・リセット・メール変更)は Supabase Auth の標準メールを使用。文面を日本語化(`supabase/templates/` の HTML を config.toml で指定)。ウェルカムメールは `auth/callback` での初回確認完了時に `sendMail(kind:'welcome')`
- 各 CTA は該当画面への直リンク(取引画面・スレッド・評価画面)

## T-8.2 通知フックの実装差し替え

- Phase 5/6/7 で no-op にしていた `notifyNewMessage / notifyPaid / notifyShipped / notifyReceived / notifyReviewRequested / notifyReviewReceived / notifyCompleted / notifyCanceled` を sendMail で実装
- `notifyNewMessage` の抑制: 同一スレッド×同一受信者で **直近 30 分以内に new_message を送信済み(email_logs を参照)ならスキップ**
- 設定画面(M-14)に通知トグルを実装: optional な kind をカテゴリ表示(取引・メッセージ・評価)で ON/OFF → notification_prefs 更新

## T-8.3 静的ページ・仕上げ

- `/terms` `/privacy` `/tokushoho` の器(「準備中」+甲支給文面の差し込み位置をコメントで明示)。フッターからリンク
- `not-found.tsx` / `error.tsx` / `loading.tsx`(スケルトン: 一覧・詳細・スレッド)を主要ルートに配置
- OGP 最低限: ルート layout に既定 metadata、商品詳細は `generateMetadata` でタイトル・先頭画像
- レスポンシブ総点検: 320 / 375 / 768 / 1280 / 1920px で全 30 画面を目視(チェックリストを `docs/plan/RESPONSIVE_CHECK.md` に生成して記録)。横スクロール発生・44px 未満のタップ領域をゼロにする

## T-8.4 E2E スモーク(Playwright)

- `e2e/smoke.spec.ts` 1 本(ローカル Supabase 前提、`supabase db reset` 後に実行):
  1. サインアップ(メール確認はローカル設定で `enable_confirmations=false` に切替えるか、admin API で confirm)→ ログイン
  2. 出品(画像 1 枚・最小必須項目)→ 公開
  3. 検索でヒット → 詳細表示 → お気に入り登録 → マイページで確認
- `playwright.config.ts`: `webServer: pnpm dev`、chromium のみ、viewport 375×812(スマホファーストで検証)

## T-8.5 デプロイ

- Vercel プロジェクト作成(環境変数を §00-4 の一覧どおり設定)、本番 Supabase プロジェクトへ `supabase db push`+seed、Storage バケット確認
- Google OAuth: 本番 URL のリダイレクト設定手順を README に記載(甲名義の GCP)
- Stripe: 本番モードは使わずテストモードのまま。Webhook エンドポイント(`/api/webhooks/stripe`)を Stripe ダッシュボードに登録し `STRIPE_WEBHOOK_SECRET` を設定
- Resend: ドメイン検証手順を README に記載(未検証の間は onboarding ドメインで送信)
- `README.md` を全面更新: セットアップ手順(ローカル/本番)、環境変数表、管理者昇格手順、Stripe CLI での Webhook 検証手順、cron・受入シナリオの動かし方

## T-8.6 受入テスト実施

- `docs/requirements/06_development_plan.md` §3 の 11 シナリオを検証環境で実施し、結果を `docs/plan/ACCEPTANCE_RESULT.md` に記録(シナリオ×結果×確認日)

## フェーズ完了条件

- [ ] 表の 9 種+ウェルカムのメールが実際に届く(ローカルは Inbucket、検証環境は実メール)
- [ ] 通知設定 OFF のカテゴリが送信されない。同一スレッド 30 分以内の再通知が抑制される
- [ ] E2E スモークが CI でグリーン
- [ ] 検証環境 URL で受入 11 シナリオすべて合格
- [ ] 品質ゲート成功、全コミット push 済み

---

# 完了後の残タスク(引き継ぎ)

- 甲: 規約文面の支給 → 静的ページへ反映 / Stripe 本番審査 / Resend ドメイン検証 / 手数料率の確定
- 発展候補(BACKLOG へ): 配送連携、売上金送金(Stripe Connect)、リアルタイムメッセージ、通知センター
