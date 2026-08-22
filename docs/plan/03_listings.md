# Phase 3: 出品(22h)

ゴール: 画像最大 10 枚付きの出品を下書き保存・公開・編集・取下げ・再公開できる。

## T-3.1 Zod スキーマ `src/features/listing/schema.ts`

2 段階のスキーマを定義する:

- `draftSchema`: title(1..80)のみ必須。他は任意(型チェックのみ)
- `publishSchema`: FR-03-1 の必須項目をすべて要求
  - category 必須。`category === 'parts'` のとき parts_subcategory 必須、frame_size 系は入力不可(null 強制)
  - brand_id または brand_other のどちらか必須(brand_id='other' センチネルは使わず、UI で「その他」選択時に brand_other 入力欄を出す)
  - condition / description(10..2000)/ price(300..9,999,999 整数)/ delivery_method / shipping_from_pref 必須
  - `delivery_method === 'in_person'` のとき meetup_pref 必須
  - images: 1..10 枚(公開時)
- `superRefine` で条件付き必須を実装し、エラーメッセージは日本語で項目直下に出す

## T-3.2 画像アップロード `src/features/listing/components/image-uploader.tsx`

- `"use client"`。`<input type="file" multiple accept="image/jpeg,image/png,image/webp">` + サムネイルグリッド(2列スマホ/5列PC)
- クライアント検証: MIME・10MB/枚・合計 10 枚
- 選択即時に `listing-images/{userId}/{crypto.randomUUID()}.{ext}` へ supabase-js で直接アップロード → state に `{ path, previewUrl }` を保持(フォーム送信時に paths を渡す)
- 並び替え: 「←/→」ボタン方式(ドラッグ&ドロップは実装しない — スマホ互換とコスト削減)。削除ボタン付き。1 枚目に「メイン」バッジ
- 表示 URL ヘルパー `src/lib/images.ts`: `listingImageUrl(path, { w })` = Storage 公開 URL + `?width=${w}&quality=75`(render/image 変換)。一覧 600 / 詳細 1200 を標準とする

## T-3.3 出品フォーム(M-01/M-02)

- `/(member)/sell/page.tsx` と `/sell/[id]/edit/page.tsx` は共通の `ListingForm` を使用(編集は defaultValues 注入)
- 1 画面縦スクロール。セクション: 画像 → 基本情報(カテゴリ・タイトル・ブランド・モデル名)→ スペック(年式・サイズ・コンポ・走行距離・コンディション)→ 説明 → 価格・受渡
- カテゴリ選択で動的表示切替(parts → サブカテゴリ表示・車体項目非表示)
- 価格入力下に手数料目安を表示: `手数料(◯%): ◯円 / 受取目安: ◯円`(`PLATFORM_FEE_RATE` を server から props で渡す。計算は `src/features/listing/fee.ts#calcFee` 純関数)
- フッター固定バー(スマホ): 「下書き保存」「公開する」の 2 ボタン

## T-3.4 Server Actions `src/features/listing/actions.ts`

- `saveDraft(input)`: draftSchema 検証 → 本人の draft 件数 < 20 を確認 → INSERT/UPDATE(status は draft のまま)→ 画像行を全削除・再INSERT(position 振り直し)
- `publishListing(input)`: publishSchema 検証 → INSERT または UPDATE で `status='published'`、初回公開時のみ `published_at=now()`
- `updateListing(id, input)`: 所有者チェック+`status in ('published','withdrawn','draft')` のみ許可(**trading/sold/suspended は拒否**)
- `withdrawListing(id)` / `republishListing(id)`: published ⇄ withdrawn。suspended は不可
- `deleteDraft(id)`: draft のみ削除可(画像は Storage からも削除)
- レート制限: `rate-limit.ts#assertRateLimit(userId, 'listing_create', 10, '1 hour')`(listings の created_at カウント)
- すべて成功時 `revalidatePath('/mypage/listings')` 等を実施

## T-3.5 出品管理一覧(M-10)

- `/(member)/mypage/listings/page.tsx`: Tabs(下書き/公開中/取引中/売却済/取下げ)。各行: サムネ・タイトル・価格・状態バッジ・操作(編集/取下げ/再公開/削除)。suspended は「運営により非公開」バッジで操作不可(閲覧のみ)

## T-3.6 ユニットテスト

- publishSchema: パーツ時のサブカテゴリ必須/車体項目除外、対面時の meetup_pref 必須、価格境界(299/300/9,999,999/10,000,000)
- calcFee: 端数切り捨て確認
- 状態遷移ガード `canEditListing(status)` / `canWithdraw(status)` 純関数

## フェーズ完了条件

- [ ] 画像 10 枚+全項目入力で公開でき、下書き(タイトルのみ)も保存できる
- [ ] 画像の並び替え・削除・メイン画像変更が動く
- [ ] 公開 → 取下げ → 再公開、下書き削除が動く
- [ ] 未確認メールのユーザーは出品不可(`email_verified_at` チェック → 案内表示)
- [ ] 他人の listing の編集 URL 直叩きが 404/エラーになる
- [ ] 品質ゲート成功
