# マイグレーションの実地検証

`docs/review/CODE_REVIEW.md` で「Docker が無く DB へ適用しての確認ができていない」と
記録していた項目を、ローカルに PostgreSQL 16 を立てて検証した。

- 実施日: 2026-09-02
- 対象: `995f9ef`(マイグレーション 6 本)
- 環境: PostgreSQL 16.13 / UTF8 / `C.utf8`
- 方法: Supabase 相当のロール(`anon` / `authenticated` / `service_role`)と
  `auth` / `storage` スキーマの最小再現を用意し、6 本を順に適用して権限を実際に試した

## 1. マイグレーションの適用

6 本すべてがエラーなく順に適用できた。

| ファイル                                         | 結果 |
| ------------------------------------------------ | ---- |
| `20260101000001_schema.sql`                      | OK   |
| `20260101000002_rls.sql`                         | OK   |
| `20260101000003_storage.sql`                     | OK   |
| `20260101000004_harden_grants.sql`               | OK   |
| `20260101000005_search_index_and_suspension.sql` | OK   |
| `20260101000006_reports_and_audit.sql`           | OK   |

## 2. 権限(S1-0 / S1-1 の修正確認)

| 試したこと                                           | 期待 | 結果                        |
| ---------------------------------------------------- | ---- | --------------------------- |
| `authenticated` が自分の `role` を `admin` に更新    | 拒否 | **拒否**(permission denied) |
| `authenticated` が自分の `status` を `active` に更新 | 拒否 | **拒否**                    |
| `anon` が `users.email` を SELECT                    | 拒否 | **拒否**                    |
| `anon` が `users.role` を SELECT                     | 拒否 | **拒否**                    |
| `anon` が `users.display_name` を SELECT             | 許可 | **許可**                    |
| 本人が `display_name` を更新                         | 許可 | **許可**                    |
| `authenticated` が `listings` へ直接 INSERT          | 拒否 | **拒否**                    |

あわせて、`auth.users` への INSERT で `public.users` が自動作成されることも確認した。

## 3. DB が保証している業務ルール

| 試したこと                           | 期待       | 結果                                    |
| ------------------------------------ | ---------- | --------------------------------------- |
| 同じ商品に有効な取引を 2 件作る      | 23505      | **拒否**(`uq_transactions_active`)      |
| キャンセル後に同じ商品を再度購入     | 許可       | **許可**                                |
| `status_before_suspend` に想定外の値 | CHECK 違反 | **拒否**                                |
| 未対応の通報がある相手を再通報       | 拒否       | **拒否**(`uq_reports_open`)             |
| 対応済みにしてから再通報             | 許可       | **許可**                                |
| 下書き商品にお気に入り               | 拒否       | **拒否**(RLS)                           |
| 自分の出品にお気に入り               | 拒否       | **拒否**(RLS)                           |
| 他人になりすましてお気に入り         | 拒否       | **拒否**(RLS)                           |
| 公開中の他人の商品にお気に入り       | 許可       | **許可**。`favorites_count` も 1 に同期 |

## 4. 検索インデックス(S2-1 の効果確認)

10 万件のダミー出品で実行計画と実測を確認した。

| 検索語         | 文字数 | 実行計画                                                             |
| -------------- | ------ | -------------------------------------------------------------------- |
| `ドグマ`       | 3      | **索引**(Bitmap Index Scan)                                          |
| `ピナレロ`     | 4      | **索引**                                                             |
| `Domane`       | 6      | **索引**                                                             |
| `クロスバイク` | 6      | 順次走査 — ただし 10 万件中 8 万件がヒットするため、これが正しい選択 |
| `レア`         | 2      | 順次走査                                                             |

**結論: 日本語でも 3 文字以上なら索引が効く。** 張り直しは意図どおり機能している。

### 分かった制限

**2 文字の検索は索引が使えない。** pg_trgm は 3 文字単位(トライグラム)で索引を作るため、
部分一致の検索語が 2 文字だと必ず全件走査になる。これは pg_trgm の仕様で回避できない。

10 万件で 60ms 程度なので、MVP の想定規模(数百〜数千件)では体感されない。
将来 2 文字検索を速くする必要が出た場合は、全文検索の導入を別途検討する。

### 注意: データベースのロケール

検証の途中で、`lc_ctype=C` のデータベースでは
**日本語からトライグラムが 1 つも作られない**(`show_trgm('ロードバイク')` が空)ことが分かった。
この状態だと日本語検索の索引がまったく効かない。

`C.utf8` では 7 個のトライグラムが作られ、正しく動作する。
Supabase の既定は UTF-8 対応のロケールなので通常は問題ないが、
**本番の DB を作成する際に `lc_ctype` を `C` にしないこと。**
確認は `select show_trgm('ロードバイク');` が空でなければよい。

## 5. 残っていること

この検証で DB 側の未確認は解消した。残るのは外部サービスの実機確認のみ。

- 本番 Supabase の Auth 設定(確認メール・パスワード再設定のリンク)
- Stripe のテストカード決済とWebhook受信
- Resend のドメイン認証とメール到達
- Google ログイン

---

# 追加検証(2026-09-04、`20260904000001_completion_hardening.sql`)

`docs/review/COMPLETION_PLAN.md` の Phase A〜C で追加したマイグレーションを、
同じ方法(PostgreSQL 16 / `C.UTF-8` / Supabase 相当のロールと `auth` `storage` スキーマの最小再現)で検証した。

## 1. 適用

7 本すべてがエラーなく順に適用できた。`scripts/gen-setup-hosted.mjs` で生成した
`supabase/setup-hosted.sql` も更地の DB に一度で適用でき、末尾で
`supabase_migrations.schema_migrations` に 7 本が記録されることを確認した。
`show_trgm('ロードバイク')` は 7 個のトライグラムを返す。

## 2. 試したこと

| 試したこと                                                                                     | 期待                             | 結果                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `thread_summaries(uid)` で最終メッセージと未読数                                               | 本文と件数が返る                 | **OK**(2 件未読、最終本文一致)                                                      |
| `unread_message_count(uid)`                                                                    | 2                                | **OK**                                                                              |
| `listing_category_counts()` / `admin_user_counts(ids)`                                         | カテゴリ別・利用者別の件数       | **OK**                                                                              |
| `authenticated` が上記 RPC を直接呼ぶ                                                          | 拒否                             | **拒否**(permission denied)                                                         |
| 利用中の本人が `bio` を更新                                                                    | 許可                             | **許可**                                                                            |
| 停止中の本人が `bio` を更新                                                                    | 0 行(RLS)                        | **0 行**                                                                            |
| 停止中の本人がお気に入り登録 / Storage へ INSERT                                               | 拒否                             | **拒否**(`is_active_user`)                                                          |
| `display_name=''` / 外部ホストの `avatar_url` / `prefecture='48'`                              | CHECK 違反                       | **拒否**                                                                            |
| `lh5.googleusercontent.com` のアイコンと `prefecture='13'`                                     | 許可                             | **許可**                                                                            |
| `release_withdrawn_account(uid)`                                                               | メール解放・identities 削除      | **OK**(`withdrawn+…@withdrawn.invalid`、identities 0 件、public.users.email も同期) |
| 退会後に同じメールで `auth.users` へ INSERT                                                    | 新しい `public.users` が作られる | **OK**(UNIQUE に当たらない)                                                         |
| `email_logs.status='skipped'`                                                                  | 許可                             | **許可**                                                                            |
| `brands` に `TREK`(既存 `Trek`)                                                                | 一意制約違反                     | **拒否**(`uq_brands_name_ci`)                                                       |
| `transactions.refunded_at / disputed_at / dispute_id`、`admin_audit_logs.target_type='review'` | 存在・許可                       | **OK**                                                                              |

## 3. 残っていること

DB 側の未確認は無い。残るのは外部サービスの実機確認(本番 Supabase の Auth 設定、
Stripe のテストカードと Webhook の 6 イベント、Resend、Google ログイン)のみ。
