# コードレビュー・課題洗い出し

対象コミット: `db5dbb6`(Phase 1〜8 完了時点)
観点: 正しさ・セキュリティ・性能・運用・リリース阻害要因

lint / typecheck / Vitest / build はすべて通過している。以下は静的解析では出ない、
設計・運用レベルの指摘。

**S1 は `5b49576` で、S2・S3 は推奨案どおり対応済み。**
マイグレーションは実際の PostgreSQL に適用して検証済み([DB_VERIFICATION.md](DB_VERIFICATION.md))。
残るのは外部サービスの実機確認と、甲の判断・支給を待つ項目のみ。
対応内容は末尾の「S2 / S3 の対応内容」にまとめている。

---

## S1 リリース前に必ず直すもの — 対応済み

### 1-0. 【追加検出】一般ユーザーが自分を管理者に昇格できた

`supabase/migrations/20260101000002_rls.sql`(修正前)

```sql
grant update on public.users to authenticated;
create policy users_update_self on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);
```

RLS ポリシーは「どの行か」しか制御できず「どの列か」は制御できない。テーブル単位で
UPDATE を許可していたため、ログイン済みユーザーが PostgREST を直接叩いて

```
PATCH /rest/v1/users?id=eq.<自分のID>   {"role": "admin"}
```

で**管理者権限を取得できた**。同じ経路で `status` を `active` に戻して利用停止を
自力解除したり、`email_verified_at` を埋めてメール確認を迂回することもできた。

**修正**: `20260101000004_harden_grants.sql` で列単位 GRANT に置き換え。
本人が更新してよいのは `display_name / avatar_url / bio / prefecture / notification_prefs` のみ。
あわせて、Server Action(service role)経由でしか書かない
`listings` / `listing_images` / `threads` / `reports` / `brands` への
authenticated からの直接書き込み権限を剥奪した。

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

**修正**: 同マイグレーションで列単位 SELECT に置き換え。公開列は
`id / display_name / avatar_url / bio / prefecture / status / created_at` のみ。
非公開列を読む必要がある 3 か所を service role 経由に変更した。

- `src/lib/session.ts` … `getCurrentUser`(email / role / email_verified_at)
- `src/lib/supabase/proxy.ts` … ルート保護(role / status)
- `src/app/(member)/mypage/settings/page.tsx` … 通知設定(notification_prefs)

同時に `getCurrentUser` を `react.cache()` で包み、`proxy.ts` のプロフィール取得を
会員向け・管理画面のパスに限定した(S2-5 の一部を同時対応。service role の呼び出しを
増やしたため、往復を放置できなかったため)。

なお `listings.suspended_reason` も同種の漏れだが、`select("*")` を使う画面が
残っているため今回は対象外(下記 S3 に移動)。

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

**修正**: `CHECKOUT_EXPIRES_MINUTES` を 45 分に変更。
掃除バッチの閾値を `STALE_PAYMENT_CLEANUP_MINUTES = 90` として定数に切り出し、
Checkout の期限より必ず後に効くようにした。

---

### 1-3. Webhook が `payment_status` を確認していない

`src/app/api/webhooks/stripe/route.ts:30` / `src/features/transaction/webhook.ts`

`checkout.session.completed` を受けたら無条件で `paid` へ遷移させている。
現在は `payment_method_types: ["card"]` に限定しているため実害は出にくいが、
コンビニ払い・銀行振込を追加した瞬間、`completed` は「未入金」の状態でも飛ぶため
**入金前に取引が成立する**。

**修正**:

- `decideCompleted` に `paymentStatus` を追加し、`paid` 以外は新設の `defer`
  (取引を保留したまま 200 を返す)にした
- `checkout.session.async_payment_succeeded` / `async_payment_failed` の分岐を追加
- 後払い手段を有効にする場合に掃除バッチが未入金の取引を潰す点を
  `cleanupStalePendingTransactions` の注意書きとして残した
- テストを 5 件追加(未入金・状態判定の優先順位)

---

### 1-4. 決済中の商品を出品者が取下げ・編集できる

`src/features/listing/actions.ts:217`(`withdrawListing`)、`:44`(`assertEditable`)

商品が `trading` になるのは決済確定(`paid`)後。購入者が Stripe の決済画面を開いている
`pending_payment` の間、商品は `published` のままなので、出品者は取下げも価格変更もできる。
その直後に購入者が決済を完了すると、取下げたはずの商品が売れ、価格変更前の金額で決済される。

**修正**: `assertNoActiveTransaction()` を追加し、`assertEditable`(編集)と
`changeStatus`(取下げ・再公開)の両方から呼ぶようにした。
判定に失敗したときは安全側に倒して操作を止める。

---

### 1-5. 管理者キャンセル後の返金が仕組みとして存在しない

`src/features/admin/actions.ts`(`cancelTransaction`)

`paid` 以降の取引を管理者がキャンセルすると、商品は公開中へ戻り、双方へ
「返金は運営より個別にご連絡します」というメールが飛ぶ。しかし**返金が必要な取引を
洗い出す手段が管理画面に無い**。運用で取りこぼすと、購入者は支払っただけの状態で放置される。

返金 API の実装は別紙1 3.(4) で対象外だが、「返金対象の抽出」は対象外に含まれない。
**修正**: 純粋判定 `needsRefund(status, paidAt)` を追加し、管理画面の取引一覧に

- 未対応件数を出す警告バナー(1クリックで対象だけに絞り込める)
- 「返金対応」フィルタ
- 各行の「要返金」バッジ

を追加した。Stripe の payment_intent ID は元から表示されているため、
そのままダッシュボードで照合できる。

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

| 箇所                                                 | 内容                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/features/listing/actions.ts:29` `replaceImages` | `listing_images` の行を全削除して入れ直すだけ。外れたパスの実体を消していない        |
| 出品フォームの離脱                                   | 画像は選択と同時に Storage へ上がる。保存せず離脱した分は永久に残る                  |
| `src/features/auth/actions.ts:284` 退会処理          | `avatar_url` を null にするだけ。**退会後もアバター画像は公開 URL でアクセスできる** |

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
imagePaths: z.array(z.string().min(1)).max(MAX_IMAGES);
```

任意の文字列をそのまま `listing_images.path` に保存できる。アバターの
`updateAvatar` では `path.startsWith(`${userId}/`)` を検証しているのに、出品側は素通し。

実害は「他人の画像や存在しないパスを自分の出品に貼れる」程度だが、同じ検証を入れるべき。
拡張子も `file.name.split(".").pop()` をそのまま使っているので、許可リスト方式にする。

**工数目安 30分**

---

### 2-5. 1リクエストあたり Supabase へ 6 往復している

| 箇所                           | 内容                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `src/lib/supabase/proxy.ts:72` | `auth.getUser()` + `users` の SELECT。**全リクエスト**で実行 |
| `src/app/layout.tsx:37`        | `getCurrentUser()` = `auth.getUser()` + `users` の SELECT    |
| 各ページ                       | `getCurrentUser()` / `requireUser()` でもう1回               |

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

| 症状                       | 内容                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 進行中取引が止まる         | `suspendUser` は出品を非表示にするが取引には何もしない。`paid` の取引を持つ出品者を停止すると、本人はログインできず発送操作ができないため取引が永久に止まる            |
| 出品者が自力で復帰できない | `unsuspendUser` は出品を戻さない。かつ `canEditListing` が `suspended` を編集不可としているため、解除後も出品者は自分の商品を触れない。管理者が1件ずつ解除するしかない |
| 元の状態が失われる         | `unsuspendListing`(`:160`)は元が下書き・取下げ中でも一律 `published` にする。非公開だったはずの商品が公開される                                                        |

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

| #    | 内容                                                                                                                                                                                                                                            | 場所                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 3-1  | 商品詳細に `generateMetadata` が無く、全商品が同じ title / description。OGP 画像も無いため SNS シェアで見栄えがしない。`sitemap.ts` / `robots.ts` も無い。別紙1に記載が無いため対象外扱いだが、C2C は検索流入が主な集客経路なので判断を仰ぐべき | `src/app/(public)/items/[id]/page.tsx`                 |
| 3-2  | 購入完了画面の `meta refresh` が無限。Webhook が来ないと5秒ごとにリロードし続ける。回数か経過時間で打ち切る                                                                                                                                     | `src/app/(member)/purchase/complete/page.tsx:31`       |
| 3-3  | `escapeLike` が `*` と `"` を処理していない。PostgREST の ilike は `*` をワイルドカードとして解釈する                                                                                                                                           | `src/features/search/queries.ts`                       |
| 3-4  | cron の認証が単純な文字列比較。`timingSafeEqual` にする                                                                                                                                                                                         | `src/app/api/cron/daily/route.ts`                      |
| 3-5  | `touch_updated_at` に `set search_path` が無い(他のトリガー関数には付いている)                                                                                                                                                                  | `schema.sql`                                           |
| 3-6  | 管理操作(停止・解除・ブランド変更)の監査ログが無い。`transaction_events` は取引のみ                                                                                                                                                             | `src/features/admin/actions.ts`                        |
| 3-7  | `shadcn`(CLI)が dependencies に入っている。devDependencies へ                                                                                                                                                                                   | `package.json`                                         |
| 3-8  | `reports` の UNIQUE が (reporter, target) なので、一度通報した対象は状況が変わっても二度と通報できない                                                                                                                                          | `schema.sql`                                           |
| 3-9  | favorites の RLS が listing 側を見ていないため、下書き・非公開商品の `favorites_count` を直接操作できる                                                                                                                                         | `rls.sql`                                              |
| 3-10 | `withdraw()` が `getCurrentUser()` を使っており、利用停止中でも退会できる                                                                                                                                                                       | `src/features/auth/actions.ts`                         |
| 3-11 | `proxy.ts` の matcher が画像拡張子で終わるパスを除外しているため、`/mypage/x.png` のようなパスがガードを迂回する(実在ルートは無いので実害なし)                                                                                                  | `src/proxy.ts`                                         |
| 3-12 | 管理画面の権限不足時に `/404` へ rewrite しているが、App Router に `/404` ルートは無く、ステータスは 200 で返る(表示は not-found)                                                                                                               | `src/lib/supabase/proxy.ts`                            |
| 3-13 | `listings.suspended_reason`(運営の非表示理由)が anon から読める。列単位 GRANT に絞るには、先に `select("*")` を使っている 2 画面を明示列指定へ直す必要がある                                                                                    | `mypage/listings/page.tsx` / `sell/[id]/edit/page.tsx` |

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

| 項目                                                | 状態                                                          |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Stripe 本番アカウント審査                           | 未着手。審査に日数がかかる                                    |
| Stripe Webhook エンドポイント登録・購読イベント選択 | 未着手                                                        |
| テストカードでの決済通し確認                        | 未実施(ACCEPTANCE_RESULT.md に記載済み)                       |
| Google ログインの実認証                             | 未実施(同上)                                                  |
| Resend のドメイン認証(SPF / DKIM)                   | 未実施(同上)                                                  |
| Vercel の環境変数設定                               | 未着手                                                        |
| Vercel Cron の動作確認                              | 未着手。Hobby プランは日1回・実行時刻はおよそ                 |
| 大量データでの性能確認                              | 未実施。S2-1 のインデックス問題が効いてくる                   |
| バックアップ・復旧手順                              | 未定義。Supabase 無料プランは自動バックアップの保持期間が短い |

---

## 対応順の提案

| 順  | 内容                                                               | 目安         |
| --- | ------------------------------------------------------------------ | ------------ |
| —   | ~~S1-0 〜 S1-5~~                                                   | **対応済み** |
| 1   | S2-8(評価の競合)、S2-9(セキュリティヘッダ)、S2-4(画像パス検証)     | 2h           |
| 2   | S2-1(検索インデックス)                                             | 1h           |
| 3   | S2-2 / S2-3(Storage の後始末)                                      | 4h           |
| 4   | 本番環境の設定と実機確認(Supabase Auth / Stripe / Resend / Vercel) | 8h           |
| 5   | S2-6(利用停止の運用)— 運用ルール確定後                             | 4h           |
| 6   | S2-7(遷移の原子化)                                                 | 4h           |
| 7   | S3 各種                                                            | 6h           |

残 **約 29h**。うちリリース前に必要なのは 1〜4 の **約 15h**。

---

## S1 修正の検証

ローカルに PostgreSQL 16 を立てて実際に適用・検証した。結果は
[DB_VERIFICATION.md](DB_VERIFICATION.md) を参照。

- マイグレーション 6 本すべて適用可
- `role` の自力昇格、`status` の自力解除、`email` / `role` の匿名参照 — いずれも拒否を確認
- 公開列の参照と本人による更新は従来どおり動作
- 二重購入の排他、通報の重複制限、お気に入りの対象制限も期待どおり

検索インデックスについては、**日本語でも 3 文字以上なら索引が効く**ことを
10 万件の実測で確認した。2 文字の検索は pg_trgm の仕様上どうしても全件走査になる
(10 万件で 60ms 程度なので MVP の規模では問題にならない)。

あわせて、**本番 DB の `lc_ctype` を `C` にすると日本語の索引がまったく効かなくなる**ことが
分かったため、デプロイ時の注意点として記録した。

## S2 / S3 の対応内容

すべて推奨案どおりに実装した。lint / typecheck / Vitest 154件 / build 通過。

### 実装で直したもの

| #    | 内容                 | 採った案                                                                                                                                                                                                                   |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2-1  | 検索インデックス     | 列ごとに GIN trgm を張り直し(`20260101000005`)。連結式の旧インデックスは削除                                                                                                                                               |
| 2-2  | Storage の後始末     | 「その場で消す」。画像差し替え時に差分削除、アイコン差し替え時に旧ファイル削除、退会時に `{userId}/` 配下を一括削除。孤児回収バッチは入れていない(出品1000件超で再検討)                                                    |
| 2-3  | 画像削除のタイミング | ✕ では Storage を触らず、保存の成功後にまとめて削除。保存せず離脱しても DB と実体が食い違わない                                                                                                                            |
| 2-4  | 画像パスの検証       | `isOwnedImagePath()` を追加し、出品・アイコンの両方で検証。拡張子はファイル名ではなく検証済み MIME から決める                                                                                                              |
| 2-6  | 利用停止の運用       | 下記「運用ルールの決定」を参照                                                                                                                                                                                             |
| 2-7  | 状態のズレ           | 「まず検知する」。`detectStateMismatch()` + `findStateMismatches()` を追加し、管理ダッシュボードに警告、日次バッチでログ出力。原子化(RPC 化)は見送り                                                                       |
| 2-9  | セキュリティヘッダ   | 基本の5種のみ。CSP は本番稼働後に Report-Only から導入する                                                                                                                                                                 |
| 3-1  | SEO                  | **訂正**: `generateMetadata` は商品詳細・公開プロフィール・検索に実装済みだった。実際に不足していた `sitemap.ts` / `robots.ts` / `metadataBase` を追加し、商品タイトルにブランド+モデル名を含め、非公開商品を `noindex` に |
| 3-2  | 購入完了の自動更新   | 24回(約2分)で打ち切り、以降は問い合わせ導線を出す                                                                                                                                                                          |
| 3-3  | 検索キーワード       | `*` `,` `(` `)` `"` を無害化                                                                                                                                                                                               |
| 3-6  | 管理操作の記録       | `admin_audit_logs` テーブルを追加し、全9種の管理操作を記録                                                                                                                                                                 |
| 3-8  | 通報の重複制限       | 永久 UNIQUE をやめ、**未対応(open)の通報がある間だけ**塞ぐ部分ユニークインデックスに                                                                                                                                       |
| 3-10 | 退会の制限           | 利用停止中・退会済みは退会手続き不可に                                                                                                                                                                                     |

未対応で残したもの: 3-4(cron 認証の定数時間比較)、3-5(`touch_updated_at` の search_path)、
3-11(proxy の matcher)、3-12(`/404` rewrite の応答コード)、3-13(`listings.suspended_reason`)。
いずれも実害が確認できず、直すと影響範囲の割に得るものが少ないため見送った。

### 運用ルールの決定(推奨どおり)

**利用停止** — 進行中の取引がある利用者は停止できないようにした
(`canSuspendUserWithTransactions`)。エラーメッセージで件数と、
取引と無関係に即実行できる「商品の非表示」を代替手段として案内する。

**停止解除** — 停止に伴って隠した出品は `listings.status_before_suspend` に
直前の状態を控え、解除時に一括で元へ戻す。運営が個別に非表示にしたものは
この列が null のままなので一括復帰の対象外。個別解除(`unsuspendListing`)は
控えがあればそこへ、無ければ「取下げ中」へ戻す
(従来は一律「公開中」に戻していたため、下書きだった商品まで公開されていた)。

**チャージバック** — `charge.dispute.created` を購読し、決済 ID から取引を引き当てて
管理者全員へメール通知する。件名は「【要対応】」始まりで、反論期限を本文に入れる。
通知設定では止められない。取引の状態は変更しない(申し立てが認められるとは限らないため)。

### 追加したマイグレーション

| ファイル                                         | 内容                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `20260101000004_harden_grants.sql`               | users の列単位 GRANT、書き込み権限の剥奪、favorites のポリシー強化 |
| `20260101000005_search_index_and_suspension.sql` | 検索インデックスの張り直し、`status_before_suspend` の追加         |
| `20260101000006_reports_and_audit.sql`           | 通報の部分ユニーク化、`admin_audit_logs` の追加                    |

`src/types/database.ts` は Docker が無く `pnpm db:types` を実行できなかったため手で更新した。
ローカル環境ができたら `pnpm db:reset && pnpm db:types` で再生成し、差分が出ないことを確認すること。

### 残っている作業

環境が揃わないと進められないものだけ。

| 項目                                                                                                            | リードタイム |
| --------------------------------------------------------------------------------------------------------------- | ------------ |
| 本番 Supabase の Auth 設定と、確認メール・パスワード再設定の実機確認                                            | 半日         |
| Stripe 本番アカウントの審査                                                                                     | 数日〜2週間  |
| Webhook エンドポイントの登録(`charge.dispute.created` と `checkout.session.async_payment_*` を購読対象に含める) | 半日         |
| テストカードでの決済通し確認                                                                                    | 半日         |
| Resend のドメイン認証                                                                                           | 1日          |
| Google ログインの実認証                                                                                         | 半日         |
| バックアップ・復旧手順の策定                                                                                    | 半日         |

甲の支給待ち: 特商法表記・利用規約・プライバシーポリシー・問い合わせ窓口・
送信元アドレス・ブランドマスタの確認・管理者アカウント。
