# Phase 7: 通報・管理画面(18h)

ゴール: 一般会員が通報でき、管理者が利用者・出品・取引・通報を管理し、ダッシュボードで概況を見られる。

## T-7.1 通報(FR-11)`src/features/report/`

- `submitReport(targetType, targetId, reason, detail)`: ガード → ログイン+メール確認 / 自分自身・自分の出品は不可 / 対象存在チェック。UNIQUE 違反(23505)→「すでに通報済みです」。レート制限 5 件/時
- `report-dialog.tsx`(client): 理由 RadioGroup+詳細 Textarea。商品詳細(S-03)のメニューと公開プロフィール(S-04)に「通報する」を設置(ログイン時のみ表示)

## T-7.2 管理画面基盤

- `src/app/admin/layout.tsx`: 独自レイアウト(左サイドバー: ダッシュボード/利用者/出品/取引/通報/ブランド。スマホは Sheet ドロワー)。ヘッダーに「管理画面」明示+一般画面へ戻るリンク
- アクセス制御は middleware(T-1.4)+layout 内での二重チェック(`users.role !== 'admin'` → notFound)
- 管理系の読み書きはすべて `src/features/admin/queries.ts / actions.ts` に集約し、**admin クライアント使用+全 action 冒頭で is_admin 検証**
- 共通部品: `AdminTable`(shadcn Table+ページネーション 20 件+検索フォーム)。検索・ページは URL クエリ

## T-7.3 利用者管理(AD-02)

- 一覧: 検索(表示名・メール部分一致)、絞り込み(status)。列: Avatar/表示名/メール/状態/登録日/出品数/取引数
- 詳細 `/admin/users/[id]`: プロフィール全項目、出品一覧(リンク)、取引一覧、受けた評価、被通報履歴
- `suspendUser(id, reason)`: users.status='suspended' + 公開中 listing を一括 suspended(suspended_reason='ユーザー利用停止に伴う')+ 進行中取引があれば画面に警告表示(処理は止めない)
- `unsuspendUser(id)`: active に戻す(listing は**自動復帰させない** — 個別に解除)

## T-7.4 出品管理(AD-03)

- 一覧: 検索(タイトル)、絞り込み(カテゴリ・status)。列: サムネ/タイトル/価格/出品者/状態/通報数/日時
- `suspendListing(id, reason)` / `unsuspendListing(id)`: suspended ⇄ published(解除時は元が published だった前提で published へ。trading/sold のものは非表示化不可 — 警告表示)
- 詳細は一般の商品詳細を admin 権限で閲覧(RLS が許可済み)+管理操作バーを表示

## T-7.5 取引管理(AD-04)

- 一覧: 検索(商品タイトル・当事者名)、絞り込み(status・期間)。列: 商品/買い手/売り手/金額/状態/Stripe ID(コピー可)/日時
- 詳細 `/admin/transactions/[id]`: 全タイムスタンプ・events 履歴・Stripe session/payment_intent ID 表示
- `cancelTransaction(id, reason)`: `canTransition(from,'canceled','admin')` ガード → canceled+listing を published に戻す(trading だった場合)→ events 記録 → 双方へメール通知フック `notifyCanceled`。**返金は行わない**旨を確認 Dialog に明記(運営が Stripe ダッシュボードで実施)

## T-7.6 通報管理(AD-05)

- 一覧: 絞り込み(status・target_type)。列: 対象(リンク付き)/理由/通報者/日時/状態
- 詳細行の展開で detail 全文+対象への操作ボタン(出品非表示/ユーザー停止へのショートカット)
- `resolveReport(id, note)`: status='resolved', resolved_by, resolved_note

## T-7.7 ブランド管理(AD-06)

- 一覧+追加フォーム+名称編集(inline)+有効/無効トグル。削除はしない(参照整合のため is_active=false)

## T-7.8 ダッシュボード(AD-01)

- KPI カード 4 枚: 会員数(withdrawn 除く)/公開中出品数/取引数(paid 以降)/GMV(completed の price 合計)。`tabular-nums`
- 直近 30 日の日次推移: 新規会員・新規出品・成立取引(paid_at 基準)の 3 系列。実装は **Recharts を追加**し LineChart 1 枚(SSR 不可のため client component)。集計は `queries.ts` で `date_trunc('day', ...)` の group by SQL(RPC 関数 `admin_daily_stats(days int)` を `0005_admin_rpc.sql` で追加)
- 最新の通報 5 件・取引 5 件のリスト

## T-7.9 ユニットテスト

- `suspendUser` の連動仕様(listing 一括 suspended)をロジック関数に切り出して確認
- `cancelTransaction` の listing 復帰分岐(trading→published / それ以外→変更なし)

## フェーズ完了条件

- [ ] 一般ユーザーで商品・ユーザーを通報 → 管理画面の通報一覧に出る
- [ ] 出品を非表示 → 検索・詳細から消え、出品者には「運営により非公開」表示
- [ ] ユーザー停止 → 当該ユーザーはログインすると利用停止画面のみ、出品が全て非表示
- [ ] 取引キャンセル → 商品が再度購入可能になり、events に記録が残る
- [ ] ダッシュボードに実数と 30 日グラフが表示される
- [ ] 非 admin で `/admin` 直叩き → 404
- [ ] 品質ゲート成功
