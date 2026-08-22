# Phase 5: メッセージ(12h)

ゴール: 商品詳細から質問を送り、スレッドで往復でき、未読バッジとメール通知(スタブ)が機能する。

## T-5.1 クエリ `src/features/message/queries.ts`

- `getThreadsForUser(uid)`: 参加スレッド(buyer として、または自分の listing 宛)を `last_message_at desc` で取得。各行に listing(サムネ・タイトル)・相手ユーザー・最終メッセージ本文・**未読数**(`messages where thread_id=? and sender_id<>uid and read_at is null` のカウント)を付与。1 クエリで済むよう RPC(`get_threads_with_unread`)を DB 関数として `0004_message_rpc.sql` に追加してもよい(実装の単純さ優先で選択)
- `getUnreadCount(uid)`: ヘッダー/タブバーのバッジ用合計。T-2.1 のスタブを差し替え

## T-5.2 Server Actions `src/features/message/actions.ts`

- `startThread(listingId, body)`: ガード → ①ログイン+メール確認済み ②自分の出品ではない ③listing.status ∈ published/trading/sold ④相手(出品者)が active。既存 `threads(listing_id, buyer_id)` があれば再利用し、`sendMessage` へ委譲 → スレッドへ redirect
- `sendMessage(threadId, body)`: Zod(1..1000)→ 参加者チェック(buyer or seller)→ 相手が withdrawn/suspended なら「このユーザーとはやり取りできません」エラー → admin クライアントで INSERT+`threads.last_message_at` 更新 → レート制限(10 件/分)→ メール通知フック `notifyNewMessage(threadId, senderId)` 呼び出し(Phase 8 で実装。ここではインターフェースだけ作り no-op)
- `markThreadRead(threadId)`: 相手発信の未読を `read_at=now()` に一括更新(スレッド表示時に Server Component から呼ぶ)

## T-5.3 画面

- `/(member)/messages/page.tsx`(M-07): スレッド一覧。行=相手 Avatar・相手名・商品サムネ小・最終メッセージ 1 行省略・相対時刻(date-fns `formatDistanceToNow` ja)・未読バッジ。0 件時は空状態
- `/(member)/messages/[threadId]/page.tsx`(M-08):
  - ヘッダー: 商品サムネ+タイトル+価格(タップで商品詳細へ)
  - 本文: 吹き出しリスト(自分=右・accent 背景 / 相手=左・surface)。日付区切り表示。古い順に表示し、初期表示で最下部へスクロール
  - 入力: 下部固定の Textarea(自動リサイズ)+送信ボタン。送信後 `router.refresh()`
  - リアルタイム同期はしない。「更新」アイコンボタンで refresh(要件どおり)
- 商品詳細(S-03)の「出品者に質問」を有効化: 未ログイン→login、ログイン済→質問モーダル(初回)or 既存スレッドへ遷移

## T-5.4 ユニットテスト

- `canSendMessage(viewer, thread, counterpartyStatus)` 純関数(参加者判定・相手状態)
- 未読数集計ロジック(RPC を使う場合は SQL に対する説明コメントで代替し、判定関数のみテスト)

## フェーズ完了条件

- [ ] 買い手が質問 → 出品者アカウントで返信 → 買い手側に未読バッジ表示 → 開封で消える
- [ ] ヘッダー・タブバーの合計未読バッジが機能する
- [ ] 同一商品×同一買い手で 2 回質問してもスレッドが 1 本に集約される
- [ ] 1,001 文字・空文字が拒否される。連投 11 件目/分がレート制限される
- [ ] 品質ゲート成功
