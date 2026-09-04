# Phase 6: 取引・決済・評価(30h)

ゴール: 購入申込 → Stripe テスト決済 → 発送連絡 → 受取確認 → 相互評価 → 完了 が一気通貫で動く。**本フェーズの決済確定は Webhook のみを正とする。**

## T-6.1 状態遷移ガード `src/features/transaction/state.ts`(純関数・最重要)

```ts
type TxStatus = "pending_payment" | "paid" | "shipped" | "received" | "completed" | "canceled";
type Role = "buyer" | "seller" | "admin" | "system";

// 遷移表: from → { to, allowedRoles }
const TRANSITIONS = {
  pending_payment: { paid: ["system"], canceled: ["system", "admin"] },
  paid: { shipped: ["seller"], canceled: ["admin"] },
  shipped: { received: ["buyer"], canceled: ["admin"] },
  received: { completed: ["system"], canceled: ["admin"] },
  completed: {},
  canceled: {},
} as const;

export function canTransition(from: TxStatus, to: TxStatus, role: Role): boolean;
export function nextActionFor(
  status: TxStatus,
  role: "buyer" | "seller",
): "pay" | "ship" | "receive" | "review" | "wait" | null;
```

全 Server Action・Webhook・cron はこの関数を必ず通す。listing 側の連動も表で固定:
`paid → listing.trading` / `completed → listing.sold` / `canceled →(listing が trading のとき)published に戻す`。

## T-6.2 購入開始(M-03)`src/features/transaction/actions.ts#startPurchase`

1. ガード: ログイン+メール確認済み / listing.status='published' / 出品者本人でない / 出品者が active / 自分が suspended でない
2. **admin クライアントで `transactions` INSERT(status='pending_payment', price=listing.price のスナップショット)**。部分ユニークインデックス違反(23505)を捕捉 →「他の方が購入手続き中です」エラー(これが排他制御の本体。INSERT 成功者だけが先へ進む)
3. Stripe Checkout Session 作成(`src/lib/stripe.ts`):
   - `mode: 'payment'`, `payment_method_types: ['card']`, `currency: 'jpy'`, `line_items: [{ price_data: { currency:'jpy', unit_amount: price, product_data: { name: title, images: [先頭画像URL] } }, quantity: 1 }]`
   - `expires_at: now + 30min`, `metadata: { transaction_id, listing_id, buyer_id }`, `client_reference_id: transaction_id`
   - `success_url: APP_URL + '/purchase/complete?tx={transaction_id}'`, `cancel_url: APP_URL + '/items/{listing_id}?canceled=1'`
4. `stripe_session_id` を transaction に保存 → `transaction_events('created')` 記録 → `redirect(session.url)`

- `/(member)/items/[id]/purchase/page.tsx`: 確認画面(画像・タイトル・価格・受渡方法・注意書き)→「支払いへ進む」で上記 action

## T-6.3 Stripe Webhook `src/app/api/webhooks/stripe/route.ts`

- `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` で署名検証(失敗は 400)
- `checkout.session.completed`:
  1. `transaction_id = session.metadata.transaction_id` で取得。**冪等**: すでに status≠'pending_payment' なら 200 で終了
  2. `canTransition('pending_payment','paid','system')` 確認 → status='paid', paid_at, stripe_payment_intent_id 保存
  3. listing → 'trading'
  4. `transaction_events('paid')` 記録、メール通知フック `notifyPaid(tx)`(購入者・出品者両方。Phase 8 実装)
- `checkout.session.expired`: pending_payment のままなら status='canceled', canceled_reason='payment_expired'、listing はそのまま published(trading にしていないため戻し不要)、events 記録
- 常に 200 を返し、処理失敗時のみ 500(Stripe のリトライに任せる)。すべて admin クライアントで処理
- ローカル検証: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` を README に記載

## T-6.4 決済完了ページ(M-04)

- `/(member)/purchase/complete/page.tsx?tx=`: transaction を取得し表示分岐 — paid 以降=「購入が完了しました」+取引画面ボタン / pending_payment=「決済を確認しています…」+数秒後 reload の案内(Webhook 遅延対策。ポーリングは meta refresh 5 秒で簡易実装)

## T-6.5 取引画面(M-05)

- `/(member)/transactions/[id]/page.tsx`: 当事者以外 404
- 構成(1 カラム、スマホ基準):
  1. ステータスタイムライン(支払い→発送→受取→評価→完了 の 5 ステップ、現在位置ハイライト)
  2. アクションカード: `nextActionFor()` で分岐
     - seller × paid: 発送・受渡連絡フォーム(shipping_note 任意 500 字)→ `markShipped`
     - buyer × shipped: 「受け取りました」確認 Dialog → `markReceived`
     - × received: 評価ボタン(自分が未評価のとき)/ 相手待ち表示
     - 相手番のときは「相手の◯◯をお待ちください」
  3. 商品サマリ(サムネ・タイトル・価格)・相手情報(Avatar・名前)・「メッセージを開く」(該当スレッドへ。無ければ startThread で作成)
  4. shipping_note の表示(発送連絡後)
- `markShipped(txId, note)` / `markReceived(txId)`: canTransition ガード → 更新+timestamps+events+通知フック

## T-6.6 評価(FR-10)`src/features/review/`

- `submitReview(txId, rating, comment)`: ガード → 当事者/status ∈ received/completed/自分は未評価。INSERT(reviewee は相手)
- 公開判定 `resolveReviewPublication(tx, reviews[])` 純関数:
  - 双方揃った → 両方 `is_published=true`、tx → 'completed'(system 遷移)+ listing → 'sold' + events + 通知 `notifyCompleted`
  - 片方のみ → 相手に評価依頼通知 `notifyReviewRequested`(初回のみ)
- `/(member)/transactions/[id]/review/page.tsx`(M-06): ★選択(RadioGroup を星 UI 化)+コメント
- 公開プロフィール(S-04)に評価一覧(is_published & !is_hidden、新しい順、ページネーション)と平均★を接続
- 取引履歴(M-11): `/(member)/mypage/purchases/page.tsx`(買い)と mypage/listings 内の取引タブ(売り)。進行中/完了/キャンセルの Tabs

## T-6.7 日次バッチ `src/app/api/cron/daily/route.ts` + `vercel.json`

- `Authorization: Bearer ${CRON_SECRET}` 検証(不一致 401)
- 処理(すべて冪等な SQL):
  1. **評価 14 日公開**: received から 14 日経過 or 片方の評価から 14 日経過した取引 → 存在する評価を公開し tx を completed・listing を sold に(0 件評価のまま 14 日は completed のみ)
  2. **期限切れ掃除**: pending_payment のまま 1 時間超の取引 → canceled(Webhook 取りこぼし保険)
- `vercel.json`: `{ "crons": [{ "path": "/api/cron/daily", "schedule": "0 19 * * *" }] }`(JST 早朝 4 時)

## T-6.8 ユニットテスト(本フェーズは厚めに)

- `canTransition` 全組み合わせ(from×to×role の許可表どおりか)
- `nextActionFor` の分岐網羅
- `resolveReviewPublication`(片方のみ/双方/14日経過/0件)
- Webhook ハンドラの冪等分岐(handler をリクエスト非依存の関数 `handleCheckoutCompleted(session, deps)` に切り出し、deps をフェイクにしてテスト)
- 排他制御: 23505 → ユーザー向けエラーへの変換

## フェーズ完了条件

- [ ] テストカード `4242 4242 4242 4242` で購入 → Webhook で paid → 商品が「取引中」
- [ ] 2 ブラウザで同時購入 → 片方が「他の方が購入手続き中です」
- [ ] Checkout 放置(expire)→ 取引 canceled・商品は published のまま購入可能
- [ ] 発送連絡 → 受取確認 → 双方評価 → completed・商品 SOLD・プロフィールに★反映
- [ ] 片方だけ評価 → 相手の評価は見えない(is_published=false)
- [ ] cron ルートを手で叩いて 14 日公開ロジックが動く(created_at を SQL で偽装して確認)
- [ ] 品質ゲート成功
