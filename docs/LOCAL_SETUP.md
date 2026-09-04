# ローカルで動かして触る

このセッションで実際に通して確認した手順。所要 15 分ほど。

## 必要なもの

- Node.js 22 以上、pnpm
- Docker Desktop(起動しておく)

## 手順

```bash
pnpm install

# .env.local を用意する
cp .env.example .env.local

# Supabase のローカルスタックを起動する
pnpm db:start

# 表示された API URL / anon key / service_role key を .env.local に書く
pnpm supabase status
```

`.env.local` の該当箇所を書き換える。

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

続けてデータを入れる。

```bash
pnpm db:reset                       # マイグレーション6本 + ブランドの初期データ
node scripts/seed-users.mjs         # テスト会員 5 名
node scripts/seed-dev.mjs 120       # ダミー商品 120 件
node scripts/seed-images.mjs        # 商品画像(自転車のシルエット)

pnpm dev
```

http://localhost:3000 を開く。

## テスト会員

`seed-users.mjs` が作る会員。パスワードはすべて `パスワード123`。

| メールアドレス       | 表示名       | 備考                          |
| -------------------- | ------------ | ----------------------------- |
| `admin@cyclex.test`  | 運営スタッフ | **管理者**。`/admin` に入れる |
| `yamada@cyclex.test` | やまだ       | 東京都                        |
| `sato@cyclex.test`   | さとう       | 大阪府                        |
| `suzuki@cyclex.test` | すずき       | 神奈川県                      |
| `tanaka@cyclex.test` | たなか       | 北海道                        |

ダミー商品はこの 5 名の出品として作られるので、別の会員でログインすれば購入側の
動きも試せる(決済は下記のとおりテストキーが必要)。

## 触ってみるとよいところ

| 画面          | 見どころ                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| `/` ホーム    | カテゴリ、新着、お気に入りの多い順                                                     |
| `/search`     | キーワード、カテゴリ・価格・サイズ・地域での絞り込み。スマホ幅だと絞り込みが下から出る |
| `/items/<id>` | 写真スライダー、スペック表、出品者の評価                                               |
| `/sell`       | 価格を入れると販売手数料 **7%** を引いた受取予定額がその場で出る                       |
| `/mypage`     | 出品・購入・お気に入り・設定                                                           |
| `/admin`      | 管理者でログインしてから。取引一覧に「返金対応」フィルタがある                         |

一般会員で `/admin` を開くと 404 になる(確認済み)。

## 決済まで試す場合

Stripe のテストキーが必要。`.env.local` に設定してから `pnpm dev` を再起動する。

```bash
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx   # stripe listen の出力値
```

別のターミナルで Webhook を転送する。

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

テストカードは `4242 4242 4242 4242`(有効期限は未来の日付、CVC は任意の3桁)。

## メールの確認

ローカルでは Mailpit が受信箱になる。http://127.0.0.1:54324 を開くと、
会員登録の確認メールや取引通知が届いているのを確認できる。

## 片付け

```bash
pnpm db:stop
```

## 補足: データベースのロケール

日本語のキーワード検索は pg_trgm の索引で動く。データベースの `lc_ctype` が `C` だと
日本語からトライグラムが作られず索引が効かなくなるため、本番環境を作ったら一度だけ
確認しておくとよい。

```sql
select show_trgm('ロードバイク');   -- 空でなければ正常
```
