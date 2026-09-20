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

| 名前 | 用途 | 性質 |
|---|---|---|
| Project URL | アプリからの接続先 | 公開値 |
| `anon` key | 同上 | 公開値(ブラウザに配られる) |
| `service_role` key | サーバー側の処理用 | **秘密。絶対に共有しない** |

`Settings → General` の **Reference ID**(`abcdefghijklm` のような文字列)も控える。

---

## 2. データベースを用意する

**`supabase/setup-hosted.sql` をまるごとコピーして、Supabase の `SQL Editor` に貼り付けて Run する。**
これだけでテーブル・権限・インデックス・Storage・メーカーの初期データがすべて入る。
CLI のインストールもログインも不要。

更地から一度で通ること、同じものを続けて三度流しても壊れないことを確認済み。

**すでに一度セットアップ済みのデータベースを更新するときも、同じ手順でよい。**
このファイルは追加されたテーブル・関数・索引だけを足すように書いてあり、
既存のデータは消えない。機能を足したあとは、もう一度貼り付けて Run する。

> 貼り忘れると、カテゴリ件数や出品タブの件数が 0 と表示され、
> ヘッダーの未読バッジが出なくなる(数え上げをデータベース側の関数に寄せているため)。

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

接続先はその場で渡す。`.env.local` を書き換えると、ローカル用に戻し忘れたときに
手元の作業が本番へ向いたままになる。

```bash
export NEXT_PUBLIC_SUPABASE_URL=<Project URL>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key>

node scripts/seed-users.mjs      # テスト会員5名(管理者含む)
node scripts/seed-dev.mjs 120    # ダミー商品120件
node scripts/seed-images.mjs     # 商品画像
```

終わったらターミナルを閉じる(渡した値はそのターミナルにしか残らない)。

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
NEXT_PUBLIC_APP_URL           https://<デプロイ後のドメイン>
PLATFORM_FEE_RATE             0.07
NEXT_PUBLIC_SUPABASE_URL      <Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY <anon key>
SUPABASE_SERVICE_ROLE_KEY     <service_role key>
CRON_SECRET                   <ランダムな文字列>
```

Stripe と Resend は、用意ができてから足す。

```
STRIPE_SECRET_KEY             sk_test_xxx
STRIPE_WEBHOOK_SECRET         whsec_xxx
RESEND_API_KEY                re_xxx
EMAIL_FROM                    CycleX <noreply@example.com>
```

`NEXT_PUBLIC_APP_URL` は初回デプロイでドメインが決まってから設定し、
もう一度デプロイし直す。

`CRON_SECRET` は次のコマンドで作れる。

```bash
openssl rand -hex 32
```

### Stripe がまだ用意できていない場合

**`STRIPE_SECRET_KEY` にダミーの値を入れないこと。** 入れると
「本物の決済が構成されている」と見なされ、決済が必ず失敗する。
変数ごと設定しないでおき、代わりに次を入れる。

```
ALLOW_DEMO_CHECKOUT           1
```

これで購入 → 支払い → 発送 → 受取確認 → 相互評価まで、
実際にお金を動かさずに通しで触れる。取引の状態が進む道筋は本番と同じなので、
「デモでは動くが本番では動かない」経路は増えない。

Stripe のキーを入れた時点で、デモ決済は自動的に無効になる。
本物の決済が使える環境でデモが動くことはない。

Resend も同様に、`RESEND_API_KEY` を設定しなければメール送信そのものを行わない。
送信記録には理由(「未設定のため送信をスキップ」)が残るので、あとから追える。
商品の閲覧・検索・会員登録は、どちらが未設定でも動く。

> **Vercel Marketplace に Supabase の連携がある場合はそちらが早い。**
> プロジェクトを繋ぐと `NEXT_PUBLIC_SUPABASE_URL` などが自動で入るため、
> 手でコピーする必要がなくなる。

---

## 5. Stripe をつなぐ(決済を本物にする)

決済が動くのはこの節を終えてから。それまではデモ決済で通しの確認ができる
(前節「Stripe がまだ用意できていない場合」)。

アプリ側の実装は済んでいるので、ここでやるのは **Stripe 側の設定と鍵の受け渡しだけ**。

### 5-1. テストモードでつなぐ

1. https://dashboard.stripe.com でアカウントを作る。画面右上が
   **「テスト環境」**(テストモード)になっていることを確認する。
2. **開発者 → API キー** を開き、**シークレットキー**(`sk_test_` で始まる)を控える。
   公開可能キー(`pk_test_`)はこのアプリでは使わない。
3. **開発者 → Webhook → エンドポイントを追加** で、次を登録する。

   | 項目 | 値 |
   |---|---|
   | エンドポイント URL | `https://<デプロイ後のドメイン>/api/webhooks/stripe` |
   | 送信するイベント | 下の5種 |

   ```
   checkout.session.completed
   checkout.session.async_payment_succeeded
   checkout.session.async_payment_failed
   checkout.session.expired
   charge.dispute.created
   ```

   - 上4つは**決済の確定とキャンセルの判断に必要**。とくに
     `completed` だけでは後払い(コンビニ・銀行振込)の入金が確定しないため、
     `async_payment_*` を外すと「支払ったのに取引が進まない」状態が起きる。
   - `charge.dispute.created` は不正利用の申し立てを運営へメールで知らせるためのもの。
     応答期限があるので外さない。

4. 登録後の画面に出る **署名シークレット**(`whsec_` で始まる)を控える。
5. Vercel の環境変数に入れて、**再デプロイする**(環境変数は再デプロイで反映される)。

   ```
   STRIPE_SECRET_KEY             sk_test_xxx
   STRIPE_WEBHOOK_SECRET         whsec_xxx
   ```

   `ALLOW_DEMO_CHECKOUT` は消してよい。残っていても
   `STRIPE_SECRET_KEY` がある限りデモ決済は動かない。

### 5-2. テストカードで通しの確認

カード番号 `4242 4242 4242 4242`、有効期限は未来の日付、CVC・郵便番号は任意。

| 確認すること | 期待 |
|---|---|
| 商品詳細 →「購入手続きへ」 | Stripe の決済画面(日本語)へ移動する |
| テストカードで支払う | 購入完了画面 → 取引画面が「取引中」になる |
| 商品ページ | SOLD 表示になり、他の人は購入できない |
| Stripe ダッシュボードの Webhook ログ | `checkout.session.completed` が 200 で成功している |
| 同じ商品を別の会員で同時に購入 | 後の人は「他の方が購入手続き中です」で止まる |
| 決済画面を開いたまま放置(45分)| 取引がキャンセルされ、商品が購入可能に戻る |
| 出品者で発送連絡 → 購入者で受取確認 | 双方に評価依頼、評価が揃うと取引完了 |

決済画面の有効期限は 45 分。期限切れの通知(`checkout.session.expired`)が
届かなかった取引も、日次バッチが 90 分以上経ったものを見つけて片付ける。

> Webhook が 4xx / 5xx で失敗している場合は、**署名シークレットの取り違え**が
> いちばん多い。テスト環境と本番環境で別の値になる。

### 5-3. 手元(ローカル)で試す場合

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

表示された `whsec_...` を `.env.local` の `STRIPE_WEBHOOK_SECRET` に入れる。
この値はコマンドを実行するたびに変わる。

### 5-4. 本番(ライブ)へ切り替えるとき

審査の通過後に行う。**テスト環境の鍵は本番では使えない。**

- [ ] 右上を「本番環境」に切り替えて、`sk_live_` のシークレットキーを取り直す
- [ ] Webhook エンドポイントを**本番環境側でもう一度登録**する(購読イベントは同じ5種)
- [ ] 新しい署名シークレット(`whsec_`)に差し替える
- [ ] `ALLOW_DEMO_CHECKOUT` が設定されていないことを確認する
- [ ] `PLATFORM_FEE_RATE`(販売手数料。既定 7%)が意図した値か確認する
- [ ] 少額の商品で実際に決済し、Stripe ダッシュボードから返金するところまで通す
- [ ] 入金(振込)サイクルと振込先口座を Stripe 側で設定する

### 5-5. このアプリがやらないこと

別紙1 3.(4) により、資金の移動そのものは対象外。運用で補う。

| こと | 対応 |
|---|---|
| 出品者への売上金の送金 | 運営が Stripe ダッシュボードで手動 |
| 返金(運営が取引をキャンセルしたとき等) | 運営が Stripe ダッシュボードで手動。アプリは取引の状態だけを戻す |
| チャージバックへの反論 | Stripe ダッシュボードで対応。アプリは発生をメールで知らせるだけ |

---

## 6. Supabase 側の設定

`Authentication → URL Configuration` を開く。

- **Site URL**: `https://<デプロイ後のドメイン>`
- **Redirect URLs**: `https://<デプロイ後のドメイン>/auth/callback`

これを設定しないと、会員登録の確認メールとパスワード再設定のリンクが機能しない。
**デプロイ後、最初に確認すべき箇所。**

---

### Google ログインを使う場合(任意)

設定しなければ、ログイン・会員登録の画面に Google のボタンは**出ない**。
壊れたボタンを見せないよう、Supabase 側で有効になっているかを見て出し分けている。

1. Google Cloud コンソールで OAuth クライアント ID(種類: ウェブアプリケーション)を作る。
2. 「承認済みのリダイレクト URI」に、Supabase の認証コールバックを入れる。

   ```
   https://<プロジェクト ref>.supabase.co/auth/v1/callback
   ```

3. Supabase の **Authentication → Sign In / Providers → Google** を有効にし、
   クライアント ID とクライアントシークレットを貼る。
4. 反映には最大5分かかる。ログイン画面を開き直してボタンが出れば設定できている。

---

## 7. 動作確認

| 確認すること | 期待 |
|---|---|
| トップページが表示される | 商品が並ぶ(シードを入れた場合) |
| 会員登録 → 確認メール → リンクを踏む | ログインできる |
| 検索「ロードバイク」 | 該当商品が出る |
| 出品フォームで価格を入れる | 販売手数料 7% を引いた受取額が出る |
| 一般会員で `/admin` を開く | 404 になる |
| 管理者で `/admin` を開く | ダッシュボードが出る |

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
