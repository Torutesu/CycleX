# デプロイ手順

Supabase(データベース)と Vercel(アプリの配信)に載せる。
**認証情報は田野さんの手元だけで扱い、チャットや共有ドキュメントには貼らない。**

所要 15 分ほど。

---

## 1. Supabase のプロジェクトを作る

1. https://supabase.com でプロジェクトを新規作成する
2. リージョンは **Northeast Asia (Tokyo)**
3. 作成時に表示される **データベースパスワードを控える**(あとで再表示できない)

作成後、`Settings → API` に以下が並ぶ。次の手順で使う。

| 名前               | 用途               | 性質                       |
| ------------------ | ------------------ | -------------------------- |
| Project URL        | アプリからの接続先 | 公開値                     |
| `anon` key         | 同上               | 公開値(ブラウザに配られる) |
| `service_role` key | サーバー側の処理用 | **秘密。絶対に共有しない** |

`Settings → General` の **Reference ID**(`abcdefghijklm` のような文字列)も控える。

---

## 2. データベースを用意する

**`supabase/setup-hosted.sql` をまるごとコピーして、Supabase の `SQL Editor` に貼り付けて Run する。**
これだけでテーブル・権限・インデックス・Storage・ブランドの初期データがすべて入る。
CLI のインストールもログインも不要。

更地から一度で通ること、同じものを二度流しても壊れないことを確認済み。

<details>
<summary>CLI で流したい場合(任意)</summary>

```bash
pnpm supabase login
pnpm supabase link --project-ref <Reference ID>
pnpm supabase db push
```

</details>

**適用後に一度だけ確認しておくとよいこと。** 日本語検索の索引が効く状態かを見る。
Supabase の画面の `SQL Editor` で実行する。

```sql
select show_trgm('ロードバイク');
```

配列が返れば正常。空 `{}` が返る場合はデータベースのロケールが `C` になっているので、
プロジェクトを作り直す(通常は起こらない)。

---

## 3. 初期データを入れる(任意)

確認用に商品を並べておきたい場合のみ。**本番運用を始めたら実行しないこと。**

手元の `.env.local` を一時的に本番の値に書き換えて実行する。

```bash
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

```bash
node scripts/seed-users.mjs      # テスト会員5名(管理者含む)
node scripts/seed-dev.mjs 120    # ダミー商品120件
node scripts/seed-images.mjs     # 商品画像
```

終わったら `.env.local` をローカル用の値に戻す。

管理者アカウントを本番の自分のアカウントにする場合は、会員登録したあとに
`SQL Editor` で次を実行する。

```sql
update public.users set role = 'admin' where email = '<自分のメールアドレス>';
```

---

## 4. Vercel に載せる

1. https://vercel.com で GitHub の `Torutesu/CycleX` を Import
2. Production Branch に `claude/bicycle-c2c-mvp-chct00` を指定
3. 環境変数に以下を入れる(値は Supabase の画面からコピーする)

```
NEXT_PUBLIC_APP_URL          https://<デプロイ後のドメイン>
PLATFORM_FEE_RATE            0.07
NEXT_PUBLIC_SUPABASE_URL     <Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY <anon key>
SUPABASE_SERVICE_ROLE_KEY    <service_role key>
STRIPE_SECRET_KEY            sk_test_xxx
STRIPE_WEBHOOK_SECRET        whsec_xxx
RESEND_API_KEY               re_xxx
EMAIL_FROM                   CycleX <noreply@example.com>
CRON_SECRET                  <ランダムな文字列>
```

`NEXT_PUBLIC_APP_URL` は初回デプロイでドメインが決まってから設定し、
もう一度デプロイし直す。

`CRON_SECRET` は次のコマンドで作れる。

```bash
openssl rand -hex 32
```

Stripe / Resend をまだ用意していない場合は、上記のダミー値のままでよい。
商品の閲覧・検索・会員登録までは動く(決済とメール送信のみ動かない)。

> **Vercel Marketplace に Supabase の連携がある場合はそちらが早い。**
> プロジェクトを繋ぐと `NEXT_PUBLIC_SUPABASE_URL` などが自動で入るため、
> 手でコピーする必要がなくなる。

---

## 5. Supabase 側の設定

`Authentication → URL Configuration` を開く。

- **Site URL**: `https://<デプロイ後のドメイン>`
- **Redirect URLs**: `https://<デプロイ後のドメイン>/auth/callback`

これを設定しないと、会員登録の確認メールとパスワード再設定のリンクが機能しない。
**デプロイ後、最初に確認すべき箇所。**

---

## 6. 動作確認

| 確認すること                         | 期待                               |
| ------------------------------------ | ---------------------------------- |
| トップページが表示される             | 商品が並ぶ(シードを入れた場合)     |
| 会員登録 → 確認メール → リンクを踏む | ログインできる                     |
| 検索「ロードバイク」                 | 該当商品が出る                     |
| 出品フォームで価格を入れる           | 販売手数料 7% を引いた受取額が出る |
| 一般会員で `/admin` を開く           | 404 になる                         |
| 管理者で `/admin` を開く             | ダッシュボードが出る               |

---

## 検証用として公開する場合

決定事項7「関係者のみ」に沿って、検索エンジンには載せない設定にする。
Vercel の環境変数に次を足すと `robots.txt` が全面拒否になる…わけではないため、
`src/app/robots.ts` を一時的に全 disallow へ変更してデプロイするのが確実。

一般公開に切り替える段階で元に戻す。

---

## 認証情報の扱い

- `service_role` key と データベースパスワードは**共有しない**
- Vercel の環境変数は暗号化されて保存されるので、そこに入れるのは問題ない
- 検証が終わったら、Supabase の `Settings → API` から key をローテーションできる
