# 作業指示: 本番デプロイを `main` に切り替える

ブラウザを操作できるエージェント(Codex の PC-Use など)にそのまま渡せる形で書いてある。
**上から順に実行し、各手順の「確認」を満たしてから次へ進むこと。**

---

## この作業の目的と、いま起きていること

公開中の https://cycle-x-six.vercel.app/ は `main` ではないビルドが動いており、
2026-09-11 以降に `main` へ入れた変更が一つも反映されていない。

根拠(2026-09-30 時点で実測):

- `/tokushoho` が「現在準備中です」のまま(特商法の内容は `main` の `6dd1b42` で掲載済み)
- `Content-Security-Policy-Report-Only` ヘッダが付いていない(`main` の `aacc0b7` で追加済み)
- `permissions-policy` は付いている → `claude/bicycle-c2c-mvp-chct00` 系のビルドと整合

**Vercel の Production Branch が `claude/bicycle-c2c-mvp-chct00` になっている可能性が高い。**

### ブランチを切り替えるだけでは動かない

2 つのブランチはマイグレーションの系統が分岐している。最初の 6 本は共通だが、その後が別物。

```
main:     …0006 → 20260904000001 / 20260904000002 / 20260910000001
                  / 20260911000001 / 20260916000001      (計 11 本)
bicycle:  …0006 → 20260101000007 〜 20260101000011        (計 11 本・別内容)
```

現在の Supabase プロジェクト(`cmeagovwydgaivyqbktj`)は bicycle 系で作られているため、
`main` が前提にするオブジェクトが無い。確実に壊れるもの:

| 欠けているもの                                         | 症状                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `consume_rate_limit` 関数 / `rate_limit_hits` テーブル | レート制限が fail-closed のため、**出品・メッセージ・通報・ログインが全部「混雑しています」で断られる** |
| `delivery_method` の CHECK が 2 値                     | 着払いの出品が保存時に失敗する                                                                          |
| `stripe_events` テーブル                               | Webhook の重複配信を追跡できない                                                                        |

**既存 DB に `main` の差分を後追いで当てるのは禁止。** 同名の関数が別定義で残るなど
影響を読みきれない。**Supabase プロジェクトを新しく作り直す。**

---

## 事前に確認すること(ここで止まる可能性がある)

### ⚠️ Stripe のキーが本番キーだったら作業を中断して報告する

現在の Vercel プロジェクトには Stripe のキーが入っている(商品詳細の「購入手続きへ」が
押せる状態から判断できる)。**これが `sk_live_` で始まる本番キーの場合、
クライアントがレビュー中にボタンを押すと実際の請求が発生する。**

手順 3 で環境変数を確認したとき、`STRIPE_SECRET_KEY` が

- `sk_test_` で始まる → そのまま進めてよい
- `sk_live_` で始まる → **作業を止めて依頼者に確認する**(テストキーに差し替えるか、
  `CYCLEX_PAYMENTS_DISABLED=1` を入れて購入導線を閉じるかの判断が必要)

Vercel の環境変数は値が隠されている場合がある。表示できないときは
先頭の数文字だけでも確認し、確認できなければ「確認できなかった」と報告して止まる。

### やってはいけないこと

- `ALLOW_DEMO_CHECKOUT` を**本番の環境変数に設定しない**。アプリが起動時に落ちて全ページ 500 になる
- `setup-hosted.sql` を**同じプロジェクトで 2 回実行しない**。冒頭のガードが止めるが、
  Storage のポリシーだけ残るため後片付けが増える
- `SUPABASE_SERVICE_ROLE_KEY` と DB パスワードを**チャット・PR・issue・スクリーンショットに写さない**
- `main` 以外のブランチに push しない。コードの変更はこの作業に含まれない

---

## 手順

### 1. リポジトリを最新にする

```bash
git clone https://github.com/Torutesu/CycleX.git
cd CycleX
git checkout main
git log --oneline -1
```

**確認**: `ac7cec9 fix: 数値入力で値が勝手に変わる 2 件を直す(PR #21 相当)` またはそれ以降。

Node 22 と pnpm 10 が必要(`.nvmrc` = 22、`packageManager` = `pnpm@10.33.0`)。

```bash
node -v      # v22.x
corepack enable && pnpm -v
pnpm install --frozen-lockfile
```

生成物が最新かを確かめる。差分が出たら**この時点で報告して止まる**
(手順 2 で貼る SQL が古い可能性がある)。

```bash
node scripts/gen-setup-hosted.mjs
git diff --exit-code -- supabase/setup-hosted.sql && echo "SQL は最新"
```

---

### 2. Supabase プロジェクトを新しく作る

ブラウザで https://supabase.com/dashboard を開く。

1. **New project** を押す
2. 名前は `cyclex-prod`(既存の `cmeagovwydgaivyqbktj` とは別物として作る)
3. Region は **Northeast Asia (Tokyo)**
4. **Database Password を生成し、安全な場所に記録する**(後から再表示できない。
   チャットには貼らない)
5. 作成完了まで待つ(2〜3 分)

#### SQL を流す

`SQL Editor` → `New query` を開き、`supabase/setup-hosted.sql`(1471 行)の**全文**を
貼り付けて Run する。**手で入力せず、クリップボード経由で貼る。**

```bash
# ターミナルからクリップボードへ(環境に応じてどちらか)
cat supabase/setup-hosted.sql | pbcopy       # macOS
cat supabase/setup-hosted.sql | xclip -sel c # Linux
```

エディタが長文を扱えない場合は、`Project Settings → Database → Connection string`
の値を使って `psql` から流してもよい(内容は同じ)。

```bash
psql "<connection string>" -f supabase/setup-hosted.sql
```

**確認**: `SQL Editor` で次を実行し、すべて一致すること(2026-09-30 に更地から実測した値)。

```sql
select count(*) from supabase_migrations.schema_migrations;   -- 11
select count(*) from pg_tables where schemaname = 'public';   -- 15
select count(*) from pg_tables
 where schemaname = 'public' and not rowsecurity;             -- 0(RLS 漏れが無い)
select proname from pg_proc where proname = 'consume_rate_limit';  -- 1 行返る
select pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.listings'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) like '%delivery_method%';
-- → 'shipping', 'shipping_cod', 'in_person' の 3 値
select show_trgm('ロードバイク');                              -- 配列が返る(空 {} なら失敗)
select count(*) from public.brands;                           -- 30
select id, public from storage.buckets order by id;
-- → avatars(true) / listing-images(true) / listing-images-hidden(false)
```

`listing-images-hidden` が **false(非公開)** であることを必ず目視する。
ここが公開になっていると、運営が商品を非表示にしても画像が公開 URL に残る。

#### API キーを控える

`Project Settings → API` から 3 つを控える(値はチャットに貼らない)。

| 名前               | 用途                                  |
| ------------------ | ------------------------------------- |
| Project URL        | `NEXT_PUBLIC_SUPABASE_URL`            |
| `anon` key         | `NEXT_PUBLIC_SUPABASE_ANON_KEY`       |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY`(**秘密**) |

#### 認証の設定

`Authentication → URL Configuration`

- **Site URL**: `https://cycle-x-six.vercel.app`(手順 4 で確定する本番 URL)
- **Redirect URLs**: `https://cycle-x-six.vercel.app/**` を追加

`Authentication → Emails` のテンプレートで、確認・再設定のリンクが
`{{ .TokenHash }}` を使う形式になっているか確認する。`{{ .ConfirmationURL }}` のままだと、
登録した端末とメールを開く端末が違うときに通らない。

---

### 3. Vercel の環境変数を確認・差し替える

https://vercel.com でプロジェクト(`cycle-x-six`)を開き、`Settings → Environment Variables`。

**まず現状を記録する。** 変数名の一覧と、値が設定されているかどうかを表にして報告する
(値そのものは載せない。`STRIPE_SECRET_KEY` だけは先頭の接頭辞を確認する → 冒頭の⚠️)。

そのうえで **Production** 環境の値を次のとおりにする。

| 変数                                          | 操作                                                            |
| --------------------------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                    | **新プロジェクトの値に差し替え**                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`               | **新プロジェクトの値に差し替え**                                |
| `SUPABASE_SERVICE_ROLE_KEY`                   | **新プロジェクトの値に差し替え**                                |
| `NEXT_PUBLIC_APP_URL`                         | `https://cycle-x-six.vercel.app`(末尾スラッシュなし)            |
| `NEXT_PUBLIC_NOINDEX`                         | **`1` を新規追加**(関係者レビュー中は検索エンジンに載せない)    |
| `RESEND_API_KEY` / `EMAIL_FROM`               | 既存のまま(本番では必須。無いと起動時に落ちる)                  |
| `CRON_SECRET`                                 | 既存のまま                                                      |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 既存のまま(ただし冒頭の⚠️)                                      |
| `SENTRY_DSN`                                  | 未設定なら空のままでよい(障害が console にしか残らなくなるだけ) |
| `ALLOW_DEMO_CHECKOUT`                         | **設定されていたら削除する**                                    |

`EMAIL_FROM` に `example.com` が含まれていると、ダミー値として起動時に弾かれる。
その場合は依頼者に実値を確認する。

---

### 4. Production Branch を `main` にして再デプロイ

`Settings → Git` を開く。

1. **Production Branch** が `main` でなければ `main` に変更して保存
2. `Deployments` タブ → 最新の Production デプロイの「…」→ **Redeploy**
   - **Use existing Build Cache のチェックは外す**(環境変数がビルド時に埋め込まれるため)
3. ビルドが Ready になるまで待つ

**確認**: デプロイのログに次が**出ていない**こと。出ていたら環境変数が足りない。

```
本番の環境変数に不備があります:
```

ログに `[production env]` の警告が出ていないかも見る。

---

### 5. 反映されたかを確かめる

ターミナルから。**すべて期待どおりになるまで次へ進まない。**

```bash
BASE=https://cycle-x-six.vercel.app

# ① main のビルドであること(CSP ヘッダが付く。旧ビルドには無い)
curl -sI "$BASE/" | grep -i "content-security-policy-report-only" \
  && echo "OK: main のビルド" || echo "NG: まだ旧ビルド"

# ② 特商法の内容が出ていること
curl -s "$BASE/tokushoho" | grep -q "鈴木 財恩" \
  && echo "OK: 特商法を掲載" || echo "NG: 準備中のまま"

# ③ 検索エンジンに載らないこと
curl -s "$BASE/robots.txt" | head -3
# → Disallow: / が出ること(Allow: / なら NEXT_PUBLIC_NOINDEX が効いていない)

# ④ 主要ページが 200 であること
for p in / /search /login /signup /terms /privacy /tokushoho; do
  printf "%-12s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "$BASE$p"
done
```

①〜④ が揃ったら、ブラウザで次を目視し、**スクリーンショットを残す**。

| 見るもの           | 期待                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| `/tokushoho`       | 事業者情報が表で出る。「販売事業者」「メールアドレス」は**準備中のままで正常** |
| `/search`          | 商品が並ぶ(手順 6 の前は 0 件でよい)                                           |
| `/sell` の受渡方法 | **配送(送料込み) / 配送(着払い) / 対面(手渡し) の 3 つ**が出る                 |
| `/login`           | Google のボタンは**出なくて正常**(Supabase 側で未設定のため)                   |

---

### 6. レビュー用のデータを入れる

新しい DB は空なので、商品が 0 件だとクライアントが何も見られない。

**このスクリプトは既知のパスワードを持つテスト会員を作る。**
関係者レビュー用の環境である前提で実行する。`NEXT_PUBLIC_NOINDEX=1` が
効いていることを手順 5 の ③ で確認してから行う。

接続先がローカルでないと既定で止まるため、明示的に許可する。

```bash
export CYCLEX_ALLOW_REMOTE=1
export NEXT_PUBLIC_SUPABASE_URL=<新プロジェクトの URL>
export SUPABASE_SERVICE_ROLE_KEY=<新プロジェクトの service_role key>

node scripts/seed-users.mjs        # テスト会員 5 名(管理者 1 名を含む)
node scripts/seed-dev.mjs 120      # ダミー出品 120 件(着払いも 2 割混ざる)
pnpm exec playwright install chromium   # 画像生成に使う
node scripts/seed-images.mjs       # 商品画像
node scripts/seed-activity.mjs     # お気に入り・閲覧数・メッセージ
```

**確認**: `/search` に画像付きで商品が並び、件数が表示されること。
商品詳細を何件か開き、**受渡方法が「配送(着払い)」の商品で
価格の下に「税込(送料は着払い)」が出る**ことを確認する。

#### 管理者アカウント

テスト会員の `admin@cyclex.test` が管理者になっている。`/admin` に入れることを確認する。
依頼者自身のアドレスを管理者にする場合は、そのアドレスで会員登録したあと
`SQL Editor` で次を実行する。

```sql
update public.users set role = 'admin' where email = '<依頼者のアドレス>';
```

---

### 7. 報告すること

作業後、次をまとめて報告する。**鍵とパスワードは値を書かず「設定済み」とだけ書く。**

1. 新しい Supabase プロジェクトの Reference ID と Region
2. 手順 2 の確認クエリの結果(11 / 13 / 0 / 3 値 / 30 / バケット 3 件)
3. 手順 3 で記録した環境変数の一覧(名前と設定有無のみ)
4. **`STRIPE_SECRET_KEY` がテストキーか本番キーか**
5. 変更前の Production Branch 名(`main` でなかった場合はその名前)
6. 手順 5 の ①〜④ の結果
7. 投入したデータの件数
8. スクリーンショット(`/tokushoho` / `/search` / `/sell` の受渡方法 / `/admin`)
9. 旧 Supabase プロジェクト(`cmeagovwydgaivyqbktj`)を**削除していないこと**
   (切り戻し用に残す。データ移行が要るかは依頼者が判断する)

### うまくいかなかったとき

- 全ページが 500 → 環境変数の不足。Vercel のビルド/関数ログに
  「本番の環境変数に不備があります」と欠けている変数名が出る
- 「混雑しているため…」で操作が全部断られる → `consume_rate_limit` が無い。
  手順 2 の SQL が途中で失敗している
- 画像が表示されない → `NEXT_PUBLIC_SUPABASE_URL` を変えたあと**再デプロイしていない**
  (`next.config.ts` がビルド時にホストを許可リストへ入れるため)
- 確認メールが届かない → `Authentication → URL Configuration` の Site URL と
  Redirect URLs が本番ドメインになっているか確認する

**判断に迷ったら止めて報告する。** 特に本番キー・課金・データ削除が絡む場面では
自分で決めずに確認を取ること。

---

## 参考

| 文書                                               | 内容                                               |
| -------------------------------------------------- | -------------------------------------------------- |
| [../DEPLOY.md](../DEPLOY.md)                       | 通常のデプロイ手順                                 |
| [../RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md) | 公開前チェックリスト(済 / 本番待ち / 甲の支給待ち) |
| [RUNBOOK.md](RUNBOOK.md)                           | 障害時の一次対応                                   |
| [OPERATIONS.md](OPERATIONS.md)                     | 平常時の運営業務                                   |
| [../REVIEW_NOTES.md](../REVIEW_NOTES.md)           | クライアントへ渡す案内文                           |
