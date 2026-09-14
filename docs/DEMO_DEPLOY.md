# デモ公開の手順(クライアントに触ってもらう用)

「一旦動くものを URL で見せたい」ときの最短手順。所要 20 分ほど。
**Stripe も Resend も独自ドメインも要らない。** 必要なのは Supabase と
Vercel のアカウント 2 つだけで、どちらも無料枠で足りる。

本番公開の手順は [DEPLOY.md](DEPLOY.md)、公開前の確認は
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)。この文書は**デモ専用**。

---

## 本番公開と何が違うか

| 項目           | デモ公開                                 | 本番公開           |
| -------------- | ---------------------------------------- | ------------------ |
| Vercel の扱い  | **Preview**(`demo` ブランチ)             | Production(`main`) |
| 決済           | デモ決済。カード情報を入れずに購入が通る | Stripe 本番キー    |
| メール         | 送らない(`email_logs` に `skipped`)      | Resend             |
| 確認メール     | Supabase 既定の SMTP(送信数が厳しい)     | Resend / 独自 SMTP |
| URL            | `*.vercel.app` の自動ドメイン            | 独自ドメイン       |
| 検索エンジン   | 載せない(`NEXT_PUBLIC_NOINDEX=1`)        | 載せる             |
| ダミーデータ   | 入れる(商品・会員・画像)                 | **入れない**       |
| 特商法表記など | 準備中のまま                             | 掲載が必要         |

デモ決済は 3 つの条件が同時に成立したときだけ有効になる(`src/lib/demo.ts`)。

- `ALLOW_DEMO_CHECKOUT=1` が設定されている
- `STRIPE_SECRET_KEY` が**未設定**
- Vercel の**本番デプロイではない**

そのため、この環境変数を誤って本番へコピーしても、実利用者が無料で
「支払い済み」を作れる状態にはならない。デモ決済が有効な間は全ページの
先頭に「デモ環境です。実際の支払いは発生しません。」の帯が出る。

---

## 1. Supabase のプロジェクトを作る(5 分)

1. https://supabase.com で新規プロジェクト。リージョンは **Northeast Asia (Tokyo)**
2. `supabase/setup-hosted.sql` をまるごとコピーし、`SQL Editor` に貼って Run
   - テーブル・権限・索引・Storage・ブランド 30 件がすべて入る
   - **更地に一度だけ**。2 回目はガードが止める
3. `Settings → API` の 3 つを控える

| 名前               | 用途           | 性質                             |
| ------------------ | -------------- | -------------------------------- |
| Project URL        | 接続先         | 公開値                           |
| `anon` key         | 同上           | 公開値(ブラウザに配られる)       |
| `service_role` key | サーバー側処理 | **秘密。チャットに貼らないこと** |

---

## 2. デモ用のブランチを用意する(1 分)

Vercel の Production Branch は `main` のままにし、**`demo` ブランチを
Preview として配信する**。こうすると `VERCEL_ENV=preview` になり、
デモ決済が有効になる。

```bash
git fetch origin main
git checkout -B demo origin/main
git push -u origin demo
```

Preview には `cyclex-git-demo-<チーム名>.vercel.app` という
**コミットが変わっても変わらない URL** が割り当たる。これをクライアントに渡す。

---

## 3. Vercel に載せる(5 分)

1. https://vercel.com で GitHub の `Torutesu/CycleX` を Import
2. Production Branch は `main` のまま
3. 環境変数を入れる(Environment は **Preview** を選ぶ)

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
NEXT_PUBLIC_APP_URL=https://cyclex-git-demo-<チーム名>.vercel.app
ALLOW_DEMO_CHECKOUT=1
NEXT_PUBLIC_NOINDEX=1
CRON_SECRET=<推測されない32文字以上の文字列>
```

`NEXT_PUBLIC_APP_URL` は 1 回目のデプロイで URL が確定してから入れ直し、
**もう一度デプロイする**(メール本文のリンクと OGP の基準になるため、
ビルド時に埋め込まれる)。

`STRIPE_SECRET_KEY` と `RESEND_API_KEY` は**入れない**。
入れるとデモ決済が無効になり、購入が進まなくなる。

> Preview はデフォルトでログインが要る場合がある。クライアントに触って
> もらうなら Vercel の `Settings → Deployment Protection` で
> **Vercel Authentication を Off**(または Protection Bypass を発行)にする。

---

## 4. デモデータを入れる(5 分)

出品が 0 件だと何も見えないので、ダミーを入れる。
**接続先がローカルでないスクリプトは既定で止まる**ので、明示的に許可する。

```bash
export CYCLEX_ALLOW_REMOTE=1
export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role key>

node scripts/seed-users.mjs        # テスト会員 5 名(管理者 1 名を含む)
node scripts/seed-dev.mjs 120      # ダミー出品 120 件
node scripts/seed-images.mjs       # 商品画像(コードで生成する placeholder)
node scripts/seed-activity.mjs     # お気に入り・閲覧数・メッセージ
```

`seed-images.mjs` は画像の描画に Chromium を使う。入っていなければ先に
`pnpm exec playwright install chromium` を実行する。

作られるテスト会員(パスワードはすべて `パスワード123`):

| メールアドレス       | 表示名       | 備考   |
| -------------------- | ------------ | ------ |
| `admin@cyclex.test`  | 運営スタッフ | 管理者 |
| `yamada@cyclex.test` | やまだ       |        |
| `sato@cyclex.test`   | さとう       |        |
| `suzuki@cyclex.test` | すずき       |        |
| `tanaka@cyclex.test` | たなか       |        |

管理画面は `admin@cyclex.test` でログインして `/admin`。

> **このデータは本番の Supabase には絶対に入れないこと。**
> 既知のパスワードを持つ会員と偽の取引が混ざる。

---

## 5. クライアントに渡す前の確認

| 確認                                     | 見るところ                           |
| ---------------------------------------- | ------------------------------------ |
| 全ページ先頭に「デモ環境です」の帯が出る | どのページでも                       |
| 商品一覧に画像付きで並ぶ                 | `/search`                            |
| 購入がカード情報なしで通る               | 商品詳細 → 購入手続き → 支払う       |
| 取引が進む                               | 発送 → 受取 → 評価                   |
| 管理画面に入れる                         | `admin@cyclex.test` でログイン       |
| 検索エンジンに載らない                   | `/robots.txt` が全面拒否になっている |

---

## クライアントへの案内文(そのまま使える)

> CycleX のデモ環境です。下記の URL からお試しいただけます。
>
> URL: https://cyclex-git-demo-<チーム名>.vercel.app
>
> - **実際の支払いは発生しません。** カード情報の入力も不要です
> - ご自身でメールアドレスを登録することもできますが、**確認メールが
>   届かない場合があります**(デモ環境ではメール配信を設定していないため)。
>   下記のテストアカウントをお使いいただくのが確実です
> - お試し用: `yamada@cyclex.test` / パスワード `パスワード123`
> - 商品・出品者・取引はすべてダミーデータです
> - 検索エンジンには載りません

---

## デモをやめるとき

Vercel の `demo` ブランチのデプロイを削除し、Supabase のプロジェクトを
一時停止または削除する。本番公開時は**別の Supabase プロジェクトを
新規に作る**(デモのダミーデータを引き継がないため)。
