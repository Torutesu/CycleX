# 障害時の一次対応

issue #5 の受入条件「障害時の一次対応手順がドキュメント化されている」に対応するもの。
**誰が・何を見て・どう復旧するか**だけを書く。原因の深追いは後回しでよい。

見る場所は 3 つ。

| 場所          | 何が分かるか                                   |
| ------------- | ---------------------------------------------- |
| Sentry        | サーバー側の例外。`context` タグで経路が分かる |
| Vercel のログ | Cron の応答、`console.error` の全文            |
| 管理画面 / DB | 実際に止まっている取引・送れていないメール     |

---

## Sentry の設定(初回のみ)

無料枠（Developer プラン: 月 5,000 エラー）で足りる。

1. https://sentry.io でプロジェクトを作る（プラットフォームは **Next.js**）
2. 表示された DSN（`https://xxxx@oyyyy.ingest.sentry.io/zzzz`）をコピー
3. Vercel の環境変数に `SENTRY_DSN` として入れて再デプロイ

**DSN を入れないと Sentry へは何も送られません**（`console.error` のみ）。
本番で未設定のときは起動ログに警告が出ます。

送らないもの（`src/lib/observability.ts`）:

- Cookie とヘッダ（セッションと個人情報が載るため）
- `sendDefaultPii: false` なので、メールアドレス・住所・メッセージ本文は入らない
- `redirect()` / `notFound()` の制御フロー例外（正常な遷移。無料枠が埋まるため除外）
- 性能トレース（`tracesSampleRate: 0`。枠はエラーに使う）

アラートは Sentry 側で設定する。**最低限これだけは入れる**:

| 条件                                | 通知先                                 |
| ----------------------------------- | -------------------------------------- |
| `context:stripe_webhook` のイベント | 即時（取引が止まる）                   |
| `context:cron` のイベント           | 即時（バッチが止まる）                 |
| `context:rate_limit` のイベント     | 即時（出品・メッセージが全部断られる） |
| `context:mail` のイベント           | 1 日 1 回まとめて                      |

---

## 1. Stripe Webhook が失敗している

**症状**: Sentry に `context:stripe_webhook`。Stripe ダッシュボードの Webhook に配信失敗。

**影響**: 支払いが済んでいるのに取引が `pending_payment` のまま。購入者は代金を払った状態で止まる。

**対応**

1. Stripe ダッシュボード → Developers → Webhooks で、失敗したイベントの中身を見る
2. **署名エラー（400）なら設定の問題**。`STRIPE_WEBHOOK_SECRET` が Webhook エンドポイントの値と一致しているか確認。直したら Stripe 側で **Resend** する
3. **500 なら DB 側の一時障害**。Stripe が自動で再送するので、まず待つ（最大 3 日間リトライされる）
4. 再送でも通らない場合、`stripe_events` テーブルで受信状況を確認する

```sql
select event_id, type, received_at, outcome, transaction_id
  from stripe_events order by received_at desc limit 20;
```

`outcome` が `failed` のままなら、その `transaction_id` を管理画面で開いて状態を確認する。

5. 支払い済みなのに取引が進んでいない場合は、管理画面の取引詳細から代理で進める

---

## 2. 日次バッチ（Cron）が失敗している

**症状**: Sentry に `context:cron`。Vercel の Cron ログで 500。

**影響**: 評価の自動公開・未決済取引の掃除・催促メールが止まる。1 日止まっても致命的ではない。

**対応**

1. Vercel のログで応答の JSON を見る。どの処理が失敗したかは `failed` と `errors` に出る

```json
{ "ok": false, "failed": ["canceled"], "errors": { "canceled": "..." } }
```

2. 手で再実行する（冪等なので何度でも安全）

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<ドメイン>/api/cron/daily
```

3. `capped` に名前が出ていたら、件数上限（300 件/回）に達している。翌日以降に残りが処理されるので、急ぐ場合だけ連続実行する
4. **`canceled`（未決済取引の掃除）が続けて失敗する場合は要注意**。Stripe のセッションを照会できていない可能性がある。ログに取引 ID が出るので、管理画面から**強制キャンセル**する（そのままだとその商品は誰も買えない）

---

## 3. メールが送れていない

**症状**: Sentry に `context:mail`。または `email_logs` に `failed` が溜まる。

**影響**: 購入・発送・受取の通知が届かない。利用者は画面を見れば状況が分かるが、気づくのが遅れる。

**対応**

1. 失敗の状況を確認する

```sql
select kind, status, error, count(*)
  from email_logs where created_at > now() - interval '1 day'
 group by kind, status, error order by count(*) desc;
```

2. Resend のダッシュボードで送信状況とドメインの認証状態（SPF / DKIM）を確認
3. `RESEND_API_KEY` が有効か（ローテーションされていないか）
4. `status='skipped'` は**正常**。通知設定 OFF、または `RESEND_API_KEY` 未設定のときに記録される

---

## 4. 出品・メッセージ・ログインが全部断られる

**症状**: Sentry に `context:rate_limit`。利用者から「混雑しているため…」と出ると連絡。

**原因**: レート制限は `consume_rate_limit` 関数で判定し、**判定できないときは通さない**（fail-closed）。関数が無い・権限が無いと全部断られる。

**対応**

1. 関数と権限を確認する

```sql
select proname from pg_proc where proname = 'consume_rate_limit';
select has_function_privilege('service_role', 'public.consume_rate_limit(text,text,integer,integer)', 'execute');
```

2. 無い場合は `supabase/migrations/20260911000001_rate_limit_and_stripe_events.sql` が未適用。`supabase link` → `pnpm db:push` で当てる
3. **アプリより先に SQL を当てるのが原則**（`docs/RELEASE_CHECKLIST.md` §3）

---

## 5. 取引と商品の状態が食い違っている

**症状**: Sentry に `context:cron` の警告「取引と商品の状態が食い違っています」。

**影響**: 「取引中なのに販売中」「売却済みなのに公開中」など。二重購入の温床になる。

**対応**

1. 警告の `transactionIds` を管理画面の取引詳細で 1 件ずつ開く
2. 取引の状態を正として、商品側を管理画面から合わせる
3. 自動では直さない（どちらが正しいかを機械的に決められないため）

---

## 6. 返金が必要な取引が残っている

**症状**: `/admin/transactions?refund=pending` に件数がある。または Sentry に `admin_late_payment` 相当の通知。

**対応**

1. Stripe ダッシュボードで該当の PaymentIntent を返金する（**返金 API は実装対象外**。運営の手作業）
2. 管理画面の取引詳細で「返金済みにする」を押して消し込む
3. `charge.refunded` の Webhook が届けば自動で消し込まれる

---

## 連絡先

甲の支給待ち（`docs/RELEASE_CHECKLIST.md` §9）。問い合わせ窓口が決まったらここに書く。
