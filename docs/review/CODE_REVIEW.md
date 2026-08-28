# コードレビュー・課題洗い出し

対象コミット: `db5dbb6`(Phase 1〜8 完了時点)
観点: 正しさ・セキュリティ・性能・運用・リリース阻害要因

lint / typecheck / Vitest 134件 / build はすべて通過している。以下は静的解析では出ない、
設計・運用レベルの指摘。

---

## S1 リリース前に必ず直すもの

### 1-1. 全会員のメールアドレスが匿名アクセスで取得できる

`supabase/migrations/20260101000002_rls.sql:31` `:179`

```sql
create policy users_select on public.users for select using (true);
grant select on all tables in schema public to anon, authenticated;
```

`users` の SELECT ポリシーが `true`、GRANT が全カラム。`NEXT_PUBLIC_SUPABASE_ANON_KEY`
はブラウザに配られる公開値なので、誰でも PostgREST を直接叩いて

```
GET /rest/v1/users?select=email,role,status,notification_prefs
```

で **全会員のメールアドレスと管理者フラグを一覧取得できる**。ポリシーのコメントは
「個人情報はアプリ側で列を絞る」としているが、アプリを経由しないアクセスを防げていない。

修正方針(列単位 GRANT へ):

```sql
revoke select on public.users from anon, authenticated;
grant select (id, display_name, avatar_url, bio, prefecture, created_at)
  on public.users to anon, authenticated;
```

ただし `src/lib/session.ts` の `getCurrentUser` は anon クライアントで
`email, role, status, email_verified_at` を読んでいるため、そのままでは自分の情報も
読めなくなる。セッション取得だけ admin クライアント経由に変えるか、
`auth.uid() = id` を条件にした本人用ポリシー付きのビューを別に用意する。

同じ問題が `listings.suspended_reason`(運営の非公開理由が誰でも読める)にもある。

**工数目安 3〜4h**

---

### 1-2. Stripe Checkout の有効期限が下限ちょうどで、決済開始が失敗しうる

`src/features/transaction/actions.ts:83` / `src/lib/constants.ts:316`

```ts
expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_MINUTES * 60,  // 30分
```

Stripe の `expires_at` は「現在より30分以上先」が要件。ちょうど 1800 秒後を指定しているため、
アプリサーバの時刻が Stripe 比でわずかでも遅れていると
`expires_at must be at least 30 minutes in the future` で Checkout Session の作成が失敗する。

失敗は catch されて取引が `canceled` になり、購入者には
「決済ページの準備に失敗しました」しか出ない。つまり**購入が一切通らない状態になりうる**のに、
原因がログを見ないと分からない。

修正: `CHECKOUT_EXPIRES_MINUTES` を 35〜60 にする。1行。
`cleanupStalePendingTransactions` の既定値 60分もそれに合わせて見直す。

**工数目安 10分**

---

### 1-3. Webhook が `payment_status` を確認していない

`src/app/api/webhooks/stripe/route.ts:30` / `src/features/transaction/webhook.ts`

`checkout.session.completed` を受けたら無条件で `paid` へ遷移させている。
現在は `payment_method_types: ["card"]` に限定しているため実害は出にくいが、
コンビニ払い・銀行振込を追加した瞬間、`completed` は「未入金」の状態でも飛ぶため
**入金前に取引が成立する**。

修正:

- `session.payment_status === "paid"` を遷移の条件に加える
- `checkout.session.async_payment_succeeded` / `async_payment_failed` の分岐を先に用意しておく

**工数目安 1h**

---

### 1-4. 決済中の商品を出品者が取下げ・編集できる

`src/features/listing/actions.ts:217`(`withdrawListing`)、`:44`(`assertEditable`)

商品が `trading` になるのは決済確定(`paid`)後。購入者が Stripe の決済画面を開いている
`pending_payment` の間、商品は `published` のままなので、出品者は取下げも価格変更もできる。
その直後に購入者が決済を完了すると、取下げたはずの商品が売れ、価格変更前の金額で決済される。

修正: `withdrawListing` と `assertEditable` で
「`status <> 'canceled'` の transactions が存在するか」を確認して弾く。

**工数目安 2h**

---

### 1-5. 管理者キャンセル後の返金が仕組みとして存在しない

`src/features/admin/actions.ts`(`cancelTransaction`)

`paid` 以降の取引を管理者がキャンセルすると、商品は公開中へ戻り、双方へ
「返金は運営より個別にご連絡します」というメールが飛ぶ。しかし**返金が必要な取引を
洗い出す手段が管理画面に無い**。運用で取りこぼすと、購入者は支払っただけの状態で放置される。

返金 API の実装は別紙1 3.(4) で対象外だが、「返金対象の抽出」は対象外に含まれない。
最低限、管理画面の取引一覧に「`canceled` かつ `paid_at` が入っている」フィルタを足し、
Stripe の payment_intent ID を表示する。

**工数目安 2h**

---

## S2 リリース前に直したいもの

### 2-1. pg_trgm インデックスがキーワード検索で使われていない

`supabase/migrations/20260101000001_schema.sql:127` / `src/features/search/queries.ts`

インデックスは連結式に張られている:

```sql
create index idx_listings_trgm on public.listings using gin (
  (coalesce(title,'') || ' ' || coalesce(description,'') || ...) gin_trgm_ops
);
```

一方クエリは列ごとの ILIKE:

```ts
`title.ilike.${pattern}`, `description.ilike.${pattern}`, ...
```

**連結式に対する式インデックスは、列単位の ILIKE には効かない。** つまりキーワード検索は
毎回 listings の全件走査になっており、ADR #4 の目的が達成できていない。数千件までは
体感できないが、数万件で顕在化する。

修正: 列ごとに GIN trgm インデックスを張る。

```sql
create index idx_listings_title_trgm on public.listings using gin (title gin_trgm_ops);
create index idx_listings_desc_trgm  on public.listings using gin (description gin_trgm_ops);
-- model_name / brand_other も同様
```

**工数目安 1h**(既存インデックスの置き換えとマイグレーション追加)

---

### 2-2. Storage の画像が消えずに溜まり続ける

3か所で参照の外れたオブジェクトが残る。

| 箇所 | 内容 |
|---|---|
| `src/features/listing/actions.ts:29` `replaceImages` | `listing_images` の行を全削除して入れ直すだけ。外れたパスの実体を消していない |
| 出品フォームの離脱 | 画像は選択と同時に Storage へ上がる。保存せず離脱した分は永久に残る |
| `src/features/auth/actions.ts:284` 退会処理 | `avatar_url` を null にするだけ。**退会後もアバター画像は公開 URL でアクセスできる** |

先方には「Supabase の有料化トリガーは出品300〜500件」と説明済み。ゴミが溜まると
その手前で 1GB に到達する。退会者の画像が残る件は個人情報の観点でも整理が必要。

修正: `replaceImages` で差分削除、退会時に `{userId}/` 配下を一括削除。
孤児オブジェクトの掃除は日次バッチに追加(`listing_images` に無いパスを削除)。

**工数目安 3h**

---

### 2-3. 画像の削除がフォーム保存前に走る

`src/features/listing/components/image-uploader.tsx:84`

✕ を押した瞬間に Storage から削除している。その後フォームを保存せずに離脱すると、
DB は削除済みのパスを参照したままになり、商品ページの画像が壊れる。

修正: 削除予定のパスをフォーム側に持ち、保存時にまとめて Storage から消す。

**工数目安 1h**

---

### 2-4. 出品画像のパスに所有者チェックが無い

`src/features/listing/schema.ts:98`

```ts
imagePaths: z.array(z.string().min(1)).max(MAX_IMAGES)
```

任意の文字列をそのまま `listing_images.path` に保存できる。アバターの
`updateAvatar` では `path.startsWith(`${userId}/`)` を検証しているのに、出品側は素通し。

実害は「他人の画像や存在しないパスを自分の出品に貼れる」程度だが、同じ検証を入れるべき。
拡張子も `file.name.split(".").pop()` をそのまま使っているので、許可リスト方式にする。

**工数目安 30分**

---

### 2-5. 1リクエストあたり Supabase へ 6 往復している

| 箇所 | 内容 |
|---|---|
| `src/lib/supabase/proxy.ts:72` | `auth.getUser()` + `users` の SELECT。**全リクエスト**で実行 |
| `src/app/layout.tsx:37` | `getCurrentUser()` = `auth.getUser()` + `users` の SELECT |
| 各ページ | `getCurrentUser()` / `requireUser()` でもう1回 |

`getCurrentUser` は `react.cache()` で包まれていないため、同一レンダー内で毎回実行される。
Vercel と Supabase のリージョンが離れると、コンテンツを引き始める前に 300〜600ms 乗る。

修正:

- `getCurrentUser` を `cache()` で包む(1行、往復が3分の1になる)
- proxy 側の `users` SELECT は保護パス・admin パスのときだけ行う
- 公開ページ(ホーム・検索・商品詳細)はログイン状態に依存する部分を切り離して
  静的化できないか検討する。現状は `cookies()` に触れるため全ページ完全動的

**工数目安 2h、効果は最も大きい**

---

### 2-6. 利用停止まわりの状態がデッドロックする

`src/features/admin/actions.ts`

| 症状 | 内容 |
|---|---|
| 進行中取引が止まる | `suspendUser` は出品を非表示にするが取引には何もしない。`paid` の取引を持つ出品者を停止すると、本人はログインできず発送操作ができないため取引が永久に止まる |
| 出品者が自力で復帰できない | `unsuspendUser` は出品を戻さない。かつ `canEditListing` が `suspended` を編集不可としているため、解除後も出品者は自分の商品を触れない。管理者が1件ずつ解除するしかない |
| 元の状態が失われる | `unsuspendListing`(`:160`)は元が下書き・取下げ中でも一律 `published` にする。非公開だったはずの商品が公開される |

先に運用ルール(下記「決めるべきこと」)を決めてから実装する。

**工数目安 4h**(ルール確定後)

---

### 2-7. 状態遷移がトランザクションになっていない

`src/features/transaction/service.ts`(`transitionTransaction`)

`transactions` の UPDATE → `listings` の UPDATE → `transaction_events` の INSERT を
別々のリクエストで投げている。途中で落ちると取引と商品の状態がずれる。

`transactions` 側は `.eq("status", transaction.status)` で楽観ロックが効いているので
二重遷移は防げているが、**金銭が絡む唯一の非原子パス**であることは記録しておくべき。

修正: Postgres 関数(RPC)に3文をまとめる。頻度は低いので優先度は中。

**工数目安 4h**

---

### 2-8. 双方が同時に評価すると取引が14日間完了しない

`src/features/review/actions.ts`

既存評価を読む → INSERT → 読んだ結果で公開判定、という順序。双方がほぼ同時に投稿すると
両方とも「既存0件」を読むため、どちらも公開・完了を実行しない。日次バッチは
`received_at <= 14日前` しか見ないので、実際に完了するまで14日かかる。

修正: INSERT 後に reviews を読み直してから判定する。数行。

**工数目安 30分**

---

### 2-9. セキュリティヘッダが設定されていない

`next.config.ts`

CSP / X-Frame-Options / Referrer-Policy / X-Content-Type-Options / Permissions-Policy が未設定。
`headers()` を追加するだけ。HSTS は Vercel が付与する。

**工数目安 1h**

---

## S3 改善したいもの

| # | 内容 | 場所 |
|---|---|---|
| 3-1 | 商品詳細に `generateMetadata` が無く、全商品が同じ title / description。OGP 画像も無いため SNS シェアで見栄えがしない。`sitemap.ts` / `robots.ts` も無い。別紙1に記載が無いため対象外扱いだが、C2C は検索流入が主な集客経路なので判断を仰ぐべき | `src/app/(public)/items/[id]/page.tsx` |
| 3-2 | 購入完了画面の `meta refresh` が無限。Webhook が来ないと5秒ごとにリロードし続ける。回数か経過時間で打ち切る | `src/app/(member)/purchase/complete/page.tsx:31` |
| 3-3 | `escapeLike` が `*` と `"` を処理していない。PostgREST の ilike は `*` をワイルドカードとして解釈する | `src/features/search/queries.ts` |
| 3-4 | cron の認証が単純な文字列比較。`timingSafeEqual` にする | `src/app/api/cron/daily/route.ts` |
| 3-5 | `touch_updated_at` に `set search_path` が無い(他のトリガー関数には付いている) | `schema.sql` |
| 3-6 | 管理操作(停止・解除・ブランド変更)の監査ログが無い。`transaction_events` は取引のみ | `src/features/admin/actions.ts` |
| 3-7 | `shadcn`(CLI)が dependencies に入っている。devDependencies へ | `package.json` |
| 3-8 | `reports` の UNIQUE が (reporter, target) なので、一度通報した対象は状況が変わっても二度と通報できない | `schema.sql` |
| 3-9 | favorites の RLS が listing 側を見ていないため、下書き・非公開商品の `favorites_count` を直接操作できる | `rls.sql` |
| 3-10 | `withdraw()` が `getCurrentUser()` を使っており、利用停止中でも退会できる | `src/features/auth/actions.ts` |
| 3-11 | `proxy.ts` の matcher が画像拡張子で終わるパスを除外しているため、`/mypage/x.png` のようなパスがガードを迂回する(実在ルートは無いので実害なし) | `src/proxy.ts` |
| 3-12 | 管理画面の権限不足時に `/404` へ rewrite しているが、App Router に `/404` ルートは無く、ステータスは 200 で返る(表示は not-found) | `src/lib/supabase/proxy.ts` |

---

## 決めるべきこと(甲の判断が必要)

### 運用ルール

1. **管理者キャンセル時の返金オペレーション** — 誰が、何を見て、いつ Stripe ダッシュボードを操作するか。返金対象の管理画面が必要か(S1-5)
2. **利用停止したユーザーの進行中取引の扱い** — 自動キャンセルするか、停止をブロックするか、手動対応か(S2-6)
3. **停止解除時に出品を自動復帰させるか** — 一括で戻すか、1件ずつ管理者が判断するか(S2-6)
4. **チャージバック(不正利用の申し立て)の扱い** — 現状 `charge.dispute.created` は未購読。通知だけでも受けるか
5. **出品者への振込サイクル** — 月1回まとめ振込にする場合、締め期間ごとの集計画面が必要か。出品者側に「次回振込予定額」を出すか
6. **禁止出品物のリスト** — 盗難車対策、防犯登録の扱いをどこまで規約に書くか

### コンテンツ(甲支給・別紙1 3.(5))

7. **特定商取引法に基づく表記** — 現在プレースホルダ(`src/app/(public)/tokushoho/page.tsx`)。事業者名・住所・連絡先・返品条件が必要
8. **利用規約・プライバシーポリシー** — 同じくプレースホルダ
9. **問い合わせ窓口** — メールアドレスかフォームか。フォームなら実装が必要(現状なし)
10. **送信元メールアドレス** — `EMAIL_FROM` の実値。ドメイン認証が必要
11. **初期ブランドマスタ** — 現在はシードの30件程度。過不足の確認
12. **管理者アカウント** — 誰の `users.role` を `admin` にするか

---

## リリースまでの障害・未検証項目

### 最優先: 本番 Supabase の Auth 設定が一切されていない

`supabase/config.toml` の設定は**ローカル専用**で、ホスティング側には反映されない。
本番の Supabase ダッシュボードで以下をすべて設定する必要がある。

- Site URL / Redirect URLs(`https://<本番ドメイン>/auth/callback`)
- メールテンプレート
- SMTP(既定の Supabase 送信は日次上限が厳しく、本番では使えない)
- Google Provider(Client ID / Secret)

**特に確認が必要なのは確認メールとパスワードリセットのリンク。**
`src/app/(auth)/auth/callback/route.ts` は `?code=` しか処理していない。
`@supabase/ssr` は PKCE 前提だが、Supabase 標準のメールテンプレートのままだと
`code` ではなく `token_hash` 形式で戻るケースがあり、その場合コールバックが
`/login?error=callback` に落ちる。**実機で通しの確認が必須**。
必要なら `token_hash` + `verifyOtp` の分岐を足す。

### そのほか

| 項目 | 状態 |
|---|---|
| Stripe 本番アカウント審査 | 未着手。審査に日数がかかる |
| Stripe Webhook エンドポイント登録・購読イベント選択 | 未着手 |
| テストカードでの決済通し確認 | 未実施(ACCEPTANCE_RESULT.md に記載済み) |
| Google ログインの実認証 | 未実施(同上) |
| Resend のドメイン認証(SPF / DKIM) | 未実施(同上) |
| Vercel の環境変数設定 | 未着手 |
| Vercel Cron の動作確認 | 未着手。Hobby プランは日1回・実行時刻はおよそ |
| 大量データでの性能確認 | 未実施。S2-1 のインデックス問題が効いてくる |
| バックアップ・復旧手順 | 未定義。Supabase 無料プランは自動バックアップの保持期間が短い |

---

## 対応順の提案

| 順 | 内容 | 目安 |
|---|---|---|
| 1 | S1-2(Checkout 期限)、S1-3(payment_status)、S2-8(評価の競合) | 2h |
| 2 | S1-1(users の列 GRANT) | 4h |
| 3 | S1-4(決済中の取下げ)、S1-5(返金対象の抽出) | 4h |
| 4 | S2-5(往復削減)、S2-1(インデックス)、S2-9(ヘッダ) | 4h |
| 5 | S2-2 / S2-3 / S2-4(画像まわり) | 5h |
| 6 | 本番環境の設定と実機確認(Supabase Auth / Stripe / Resend / Vercel) | 8h |
| 7 | S2-6(利用停止の運用)— 運用ルール確定後 | 4h |
| 8 | S2-7(遷移の原子化)、S3 各種 | 8h |

合計 **約 39h**。S1 と S2-5 / S2-9 までの「リリース最低ライン」は **約 14h**。
