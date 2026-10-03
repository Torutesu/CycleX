# 本番環境の設定手順書(エージェント向け)

Codex などの PC 操作エージェントに渡して、管理画面(Supabase / Vercel / Stripe / Resend)の
設定を進めてもらうための手順書。人が読んでもそのまま使える。

**コードの変更はこの手順書の対象外。** リポジトリのファイルは読むだけにし、編集・コミットはしない。

---

## 0. 守ること(エージェントへ)

作業を始める前に必ず読むこと。ここに反する操作が必要になったら、その場で止まって人に聞く。

1. **秘密の値をどこにも書かない。**
   `sk_` `whsec_` `re_` `eyJ` で始まる値、service_role key、データベースのパスワード、各種トークンは、
   管理画面の入力欄に直接貼るだけにする。チャット・報告・ログ・ファイル・コミットに書かない。
   報告で触れるときは「設定した」とだけ書く。
2. **対象を毎回確かめる。** 違っていたら操作せずに止まる。
   - Supabase:プロジェクト名 `CycleX2.0`、URL に `esqwuifhnlyjuxqjicar` が入っていること
   - Vercel:ドメインが `cycle-x-six.vercel.app` のプロジェクトであること
3. **消す・無効にする・作り直すのは、この手順書に書いてある対象だけ。**
   見慣れないキーやトークンがあっても触らない。
4. **Stripe はテストモードだけを操作する。** 本番モード(Live)の画面では何も変更しない。
5. **ログイン、2 段階認証、支払い情報の入力は人がやる。** その画面が出たら待つ。
6. **SQL Editor で SQL を実行しない。** 必要な SQL は Claude から別に渡す。
7. **迷ったら止まる。** 画面の表記がこの手順書と違うとき、目的に合う操作が 1 つに決まらなければ、
   スクリーンショットを添えて人に聞く。推測で進めない。

---

## 1. 固定の値

| 項目 | 値 |
|---|---|
| 公開中のサイト | `https://cycle-x-six.vercel.app` |
| Supabase プロジェクト | `CycleX2.0`(ref:`esqwuifhnlyjuxqjicar`) |
| Supabase の URL | `https://esqwuifhnlyjuxqjicar.supabase.co` |
| GitHub | `Torutesu/CycleX`(ブランチ `claude/bicycle-c2c-mvp-chct00`) |
| サイト名 | `BicycleMarket` |

### Vercel の環境変数を変えたあとは、必ず再デプロイする

環境変数は、次のデプロイから効く。変えただけでは公開中のサイトは変わらない。

1. Vercel のプロジェクト → Deployments
2. いちばん上の Production の行の「︙」→ Redeploy
3. 状態が Ready になるまで待つ(2〜3 分)

環境変数を入れるときは、対象の環境に **Production** を含める。

---

## 2. 順番

| # | 作業 | いつ | 止まる条件 |
|---|---|---|---|
| T1 | Supabase の認証 URL | 今すぐ | — |
| T2 | 認証メールを日本語にする | 今すぐ | — |
| T3 | Supabase の鍵を作り直す | 今すぐ | 旧形式の鍵を作り直す操作が見つからない |
| T4 | 使っていない Vercel トークンを消す | 今すぐ | どれを消すか人が決めていない |
| T5 | 日次バッチの合言葉(CRON_SECRET) | 今すぐ(確認のみ) | — |
| T6 | デモデータを入れる | T3 のあと | — |
| T7 | Stripe(テストモード) | T6 のあと | テストモードに切り替えられない |
| T8 | Resend(メール送信) | 先方から招待とドメインが来てから | ドメインの DNS を触れる人がいない |
| T9 | Google ログイン(任意) | 必要になったら | Google Cloud のアカウントが無い |

---

## T1. Supabase の認証 URL

**目的:** 会員登録の確認メールと、パスワード再設定メールのリンクが、正しい画面に戻ってくるようにする。

**手順**

1. Supabase → Authentication → URL Configuration
2. Site URL:`https://cycle-x-six.vercel.app`
3. Redirect URLs に追加:`https://cycle-x-six.vercel.app/auth/callback`
4. 保存
5. Authentication → Sign In / Providers → Email を開き、**Confirm email が有効**になっていることを確かめる
   (無効なら有効にする。アプリは確認メールを前提に作っている)

**確認**(T8 の前は、Supabase のチームメンバーのアドレス宛にしか届かない)

1. サイトのログイン画面 →「パスワードを忘れた方」→ チームメンバーのアドレスを入れる
2. 届いたメールのリンクを開く
3. **新しいパスワードを入れる画面**(URL が `/reset-password/update`)に着けば成功

**うまくいかないとき:** トップページに着いてしまう場合は、Redirect URLs に
`https://cycle-x-six.vercel.app/**` も追加して、もう一度試す。

---

## T2. 認証メールを日本語にする

**目的:** 会員登録・パスワード再設定・メールアドレス変更のメールは、Supabase の既定だと英語で届く。日本語の文面に差し替える。

文面はリポジトリに入っている。ファイルを開き、**中身をまるごと**コピーして貼る。

| Supabase のテンプレート | 件名 | 本文のファイル |
|---|---|---|
| Confirm signup | `【BicycleMarket】メールアドレスの確認` | `supabase/templates/confirmation.html` |
| Reset password | `【BicycleMarket】パスワードの再設定` | `supabase/templates/recovery.html` |
| Change email address | `【BicycleMarket】メールアドレス変更の確認` | `supabase/templates/email_change.html` |

**手順**

1. Supabase → Authentication → Emails(Email Templates)
2. 上の表の 3 つそれぞれについて、件名を置き換え、本文(Message body)を消してからファイルの中身を貼って保存
3. `{{ .ConfirmationURL }}` などの `{{ }}` で囲まれた部分は、Supabase が差し込む値。**書き換えない**

ほかのテンプレート(Invite user、Magic Link など)はアプリで使っていないので、触らない。

**確認:** T1 の確認と同じ手順で、届いたメールの件名と本文が日本語になっていること。

---

## T3. Supabase の鍵を作り直す

**目的:** 以前のやり取りで、service_role key がチャットに貼られている。この鍵があれば誰でもデータベースを
読み書きできるため、作り直して古い鍵を使えなくする。

**この作業の影響**

- anon key と service_role key が両方変わる。T3 の手順 5 が終わるまで、**公開中のサイトはエラーになる**(数分)
- ログイン中の人は全員ログアウトされる

**手順**

1. 先に Vercel のプロジェクト → Settings → Environment Variables を別タブで開いておく
2. Supabase → Project Settings → API Keys(または JWT Keys)
3. アプリが使っているのは**旧形式の鍵**(`eyJ` で始まる anon と service_role)。
   旧形式の鍵を作り直す操作(JWT secret の再生成など)を探して実行する
4. 新しい anon key と service_role key を表示してコピー
5. Vercel の環境変数を置き換えて、再デプロイ
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← 新しい anon key
   - `SUPABASE_SERVICE_ROLE_KEY` ← 新しい service_role key

**止まる条件**

- 旧形式の鍵を作り直す操作が見当たらず、新形式(`sb_publishable_` / `sb_secret_`)への切り替えしか出てこない
  → アプリは新形式で動作確認をしていない。操作せずに止まり、画面を人に見せる
- 画面に、上の「影響」以外の警告が出た → 止まる

**確認**

1. 再デプロイ後、サイトのトップを開いて商品一覧が表示される(エラー画面でない)
2. ログインできる

---

## T4. 使っていない Vercel トークンを消す

**目的:** 以前のやり取りで Vercel のトークンが使われている。使っていないものを消す。

**手順**

1. Vercel → 右上のアカウント → Account Settings → Tokens
2. 一覧の**名前と作成日だけ**を人に伝え、どれを消すか人に決めてもらう
3. 人が指定したものだけを Delete

デプロイは GitHub 連携で動いているので、個人のトークンを消してもデプロイは止まらない。

---

## T5. 日次バッチの合言葉(CRON_SECRET)

**目的:** 毎日 4:00(日本時間)に次の 3 つが動く。外から勝手に呼ばれないよう、合言葉で守っている。
合言葉が無いとバッチはまるごと止まり、特に 1 が動かないと**評価を片方しか付けていない取引が永遠に完了しない**。

1. 評価の 14 日自動公開と、それに伴う取引の完了
2. 支払われないまま放置された取引の片付け(商品を購入できる状態に戻す)
3. 取引と商品の状態のずれの検出(件数をログに残す)

**現状:** 本番には設定済み(合言葉なしで呼ぶと 401 が返ることで確認した)。T5 は確認だけでよい。

**確認:** Vercel のプロジェクト → Settings → Cron Jobs に `/api/cron/daily` があり、
「Run」で手動実行したときにログが 200 になること。

**401 や 500 になるとき:** 環境変数 `CRON_SECRET` が消えている可能性がある。
ターミナルで次を実行し、出てきた文字列を `CRON_SECRET` として登録して再デプロイする。

```bash
openssl rand -hex 32
```

---

## T6. デモデータを入れる

**目的:** 今の本番は商品が 0 件。動作確認と先方のデモのために、ダミーの会員と商品を入れる。
T3 で鍵を作り直したあとにやる(新しい service_role key を使う)。

**手順**(ターミナル。リポジトリのフォルダで実行)

```bash
git pull
pnpm install
npx playwright install chromium     # 画像の生成に使う。初回だけ

export NEXT_PUBLIC_SUPABASE_URL=https://esqwuifhnlyjuxqjicar.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=      # ← ここに新しい service_role key を貼る

node scripts/seed-users.mjs          # テスト会員 5 名
node scripts/seed-dev.mjs 120        # ダミー商品 120 件
node scripts/seed-images.mjs         # 商品の画像
```

- `.env.local` は**書き換えない**(手元の開発環境が本番を向いてしまう)
- 終わったらターミナルを閉じる(貼った鍵はそのターミナルにしか残らない)

**確認:** サイトのトップでカテゴリに件数が出て、新着に商品が並ぶこと。

テスト会員はすべてパスワード `パスワード123`。`admin@cyclex.test` は管理者で、`/admin` に入れる。

---

## T7. Stripe(テストモード)

**目的:** 今はデモ決済(お金が動かない疑似の支払い)で動いている。Stripe のテストモードにつなぎ、
本物と同じ流れで決済できるようにする。テストモードなので実際の請求は発生しない。

**手順**

1. Stripe のダッシュボードで、**テストモード**に切り替える(画面上部の切り替え)。
   以降、画面に「テスト」「Test mode」の表示が出ていることを毎回確かめる
2. 開発者(Developers)→ API キー → シークレットキー(`sk_test_` で始まる)をコピー
   → Vercel の `STRIPE_SECRET_KEY` に登録
3. 開発者 → Webhook → エンドポイントを追加
   - URL:`https://cycle-x-six.vercel.app/api/webhooks/stripe`
   - 受け取るイベント(この 5 つだけ):
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `checkout.session.expired`
     - `charge.dispute.created`
4. 作成したエンドポイントの署名シークレット(`whsec_` で始まる)をコピー
   → Vercel の `STRIPE_WEBHOOK_SECRET` に登録
5. Vercel の環境変数 `ALLOW_DEMO_CHECKOUT` を削除する
6. 再デプロイ

**確認**

1. サイト上部の「デモ環境です」の帯が消えていること
2. テスト会員 2 人で、片方が出品した商品をもう片方で購入する
   - カード番号 `4242 4242 4242 4242`、有効期限は未来の日付、セキュリティコードは任意の 3 桁
3. Stripe の画面から戻ってきたあと、取引画面が「支払い済み」になること
4. Stripe → Webhook → 作ったエンドポイントの送信履歴が、すべて 200 になっていること
5. Stripe の決済画面に出ていた**事業者名**をメモして報告する(先方の名義の確認に使う)

**元に戻すとき:** 購入でエラーが出て直せない場合は、`STRIPE_SECRET_KEY` を削除し、
`ALLOW_DEMO_CHECKOUT` を `1` で登録し直して再デプロイすると、デモ決済に戻る。

---

## T8. Resend(メール送信)

**目的:** 今の本番は、会員登録などのメールが Supabase の既定の送信で出ている。これは
**Supabase のチームメンバー宛にしか届かず、1 時間に数通まで**なので、一般の利用者は会員登録できない。
Resend につないで、誰にでも届くようにする。取引の通知メールもここから送る。

**前提**

- 先方から Resend のチームに招待されていること
- 送信元に使う**ドメイン**が決まっていて、その DNS を設定できる人がいること
  (以下、そのドメインを `<ドメイン>` と書く。人に確認して置き換える)

**手順**

1. Resend → Domains → Add Domain → `<ドメイン>` を入力(リージョンは Tokyo があればそれを選ぶ)
2. 表示された DNS レコード(MX・TXT など)を、ドメインの管理画面に登録する(人の作業になることが多い)
3. Resend に戻って Verify。状態が Verified になるまで待つ(数分〜数時間)
4. API Keys → Create API Key を **2 つ**作る(片方だけ止められるように分ける)
   - `BicycleMarket app`:権限 Sending access、ドメイン `<ドメイン>`
   - `BicycleMarket auth`:権限 Sending access、ドメイン `<ドメイン>`
5. Vercel の環境変数
   - `RESEND_API_KEY` ← `BicycleMarket app` のキー
   - `EMAIL_FROM` ← `BicycleMarket <noreply@<ドメイン>>`
6. 再デプロイ
7. Supabase → Authentication → Emails → SMTP Settings → カスタム SMTP を有効にする
   | 項目 | 値 |
   |---|---|
   | Sender email | `noreply@<ドメイン>` |
   | Sender name | `BicycleMarket` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | `BicycleMarket auth` のキー |

**確認**

1. 自分で読めるアドレス(チームメンバー以外でよい)で会員登録する
2. `noreply@<ドメイン>` から日本語の確認メールが届く(迷惑メールに入っていないかも見る)
3. リンクを開くとログインした状態になる
4. T7 の購入を 1 回行い、出品者と購入者の両方に取引の通知メールが届く

---

## T9. Google ログイン(任意)

**目的:** 「Google でログイン」を出す。設定が済むと、ログイン画面に 5 分ほどでボタンが現れる
(設定前はボタン自体が出ないので、今のままでも壊れてはいない)。

**前提:** 先方名義の Google Cloud のアカウントがあること。

**手順**

1. Google Cloud Console → API とサービス → 認証情報 → OAuth クライアント ID を作成(ウェブ アプリケーション)
2. 承認済みのリダイレクト URI:`https://esqwuifhnlyjuxqjicar.supabase.co/auth/v1/callback`
3. 表示されたクライアント ID とシークレットを、Supabase → Authentication → Sign In / Providers → Google に入れて有効にする

**確認:** 5 分ほど待ってからログイン画面を開き、Google のボタンでログインできること。

---

## 3. この手順書の外にあるもの

### 先方から受け取るもの(エージェントの作業ではない)

- 特定商取引法に基づく表記・利用規約・プライバシーポリシーの文面
  (今は 3 ページとも「準備中」。**Stripe の本番審査では特商法表記の URL を求められる**)
- 問い合わせ先、メールの送信元に使うドメイン
- 管理者にする先方のアカウントのメールアドレス
- Stripe の本番利用の申請(事業者情報・口座)
- ブランド一覧の確認 3 点(`NJS` の扱い、`tern` の表記、綴りの怪しい `DONTZER` `KORY YORK` `GREDDY`)

### コード側(Claude が対応する。エージェントは触らない)

- 規約類の文面の掲載
- 検索エンジンに載せない設定(今は全面許可になっている)
- 確認メールの期限が切れた人がログインしたときの案内

### 一般公開の前に

- テスト会員とデモ商品の削除(手順は Claude から渡す)
- 管理者を先方のアカウントへ切り替える
- Stripe を本番モードのキーに切り替える(T7 と同じ手順を本番モードで行う)
- iPhone の Safari で一通り触る

---

## 4. 報告のしかた

作業が終わったら、次の形で返す。**秘密の値は書かない。**

```
T1 認証 URL ……………… 済 / 未 / 止まった(理由)
T2 メールの日本語化 …… 済 / 未 / 止まった(理由)
T3 鍵の作り直し ……… 済 / 未 / 止まった(理由)
T4 Vercel トークン …… 済(消した数) / 未
T5 CRON_SECRET ……… 済(Run で 200) / 未
T6 デモデータ ………… 済 / 未
T7 Stripe テスト ……… 済(決済画面の事業者名:____) / 未 / 止まった(理由)
T8 Resend …………… 済 / 未 / 止まった(理由)
T9 Google ログイン …… 済 / 見送り

気づいたこと:
```
