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

このファイルは `node scripts/gen-setup-hosted.mjs` で migrations から生成する(手で編集しない)。
**更地に一度だけ**実行する。2 回目は `create table` で失敗する。以後の変更は
`supabase link` → `pnpm db:push` で適用する(末尾で適用済みとして記録しているので二重には流れない)。

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

## 3. 管理者アカウントを設定する

本番のアカウントで会員登録したあと、`SQL Editor` で次を実行する。

```sql
update public.users set role = 'admin' where email = '<自分のメールアドレス>';
```

> **本番にダミーデータやテスト会員を投入しないこと。**
> `scripts/seed-*.mjs` は開発用で、既知のパスワードを持つテスト会員や偽の取引を作る。
> 接続先がローカルの Supabase 以外なら、これらのスクリプトは自動的に止まる
> (どうしても検証環境に入れたい場合だけ `--allow-remote` を付ける)。
> E2E(`pnpm test:e2e`)も同じ理由でローカル以外には接続しない。

## 4. Vercel に載せる

1. https://vercel.com で GitHub の `Torutesu/CycleX` を Import
2. Production Branch に `main` を指定(作業ブランチをそのまま本番にしない)
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
NEXT_PUBLIC_NOINDEX          1(関係者限定で検証している間だけ。一般公開時に外す)
```

`ALLOW_DEMO_CHECKOUT` は本番に入れない(入っていると起動時に止まる)。Preview 環境で
Stripe 未構成のまま購入まで通したいときだけ Preview の環境変数として設定する。

`NEXT_PUBLIC_APP_URL` は初回デプロイでドメインが決まってから設定し、
もう一度デプロイし直す。

`CRON_SECRET` は次のコマンドで作れる。

```bash
openssl rand -hex 32
```

Stripe / Resend をまだ用意していない場合、本番ではダミー値のままにできない(起動時の検証で止まる)。
先に Preview 環境で確認し、本番は両方が揃ってから公開する。

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

そのほかの Authentication の設定(メール確認必須・パスワード要件・メールテンプレートの
`token_hash` 化・SMTP・Google・Secure email change)は README の
「本番 Supabase の設定項目一覧」を参照。

Stripe の Webhook は次のイベントを購読する:
`checkout.session.completed` / `checkout.session.expired` /
`checkout.session.async_payment_succeeded` / `checkout.session.async_payment_failed` /
`charge.dispute.created` / `charge.refunded`

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
Vercel の環境変数に `NEXT_PUBLIC_NOINDEX=1` を入れてデプロイすると `robots.txt` が全面拒否になる。
一般公開に切り替える段階で外す。

---

## 認証情報の扱い

- `service_role` key と データベースパスワードは**共有しない**
- Vercel の環境変数は暗号化されて保存されるので、そこに入れるのは問題ない
- 検証が終わったら、Supabase の `Settings → API` から key をローテーションできる
