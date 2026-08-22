# Phase 4: 検索・一覧・商品詳細・お気に入り(26h)

ゴール: ゲストがホーム→検索→詳細を回遊でき、会員がお気に入りできる。閲覧系の完成。

## T-4.1 検索クエリビルダ `src/features/search/query.ts`

- `searchParamsSchema`(Zod): `q, category, sub, brand[](uuid), price_min, price_max, size[], pref[], condition[], include_sold(bool), sort('new'|'price_asc'|'price_desc'|'popular'), page(≥1)` — 不正値は無視してデフォルトへ(throw しない)
- `buildSearchQuery(supabase, params)`:
  - base: `listings` + `listing_images(position=0)` + `brands(name)` を select、`status in ('published','trading')`(include_sold 時は +'sold')
  - q: 空白区切りで分割し、各語について `or(title.ilike.%w%, description.ilike.%w%, model_name.ilike.%w%, brand_other.ilike.%w%)` を AND 連結。ブランド名一致は brand_id サブクエリ(brands.name ilike)で対応
  - 絞り込みは各カラムの `eq/in/gte/lte`
  - sort: new=`published_at desc` / price_asc / price_desc / popular=`favorites_count desc, published_at desc`
  - `range((page-1)*24, page*24-1)` + `count: 'exact'`
- 純関数部分(パラメータ正規化・語分割)を分離してユニットテスト

## T-4.2 検索一覧ページ(S-02)

- `/(public)/search/page.tsx`(Server Component、`searchParams` 受け取り)
- 構成: PC=左サイドバー(w-64 フィルタ)+右グリッド(4列)/ スマホ=上部に「絞り込み」ボタン(Sheet でボトムシート)+2列グリッド
- `FilterPanel`(client): カテゴリ(RadioGroup+パーツ時サブカテゴリ)、ブランド(Checkbox リスト、検索付き)、価格帯(プリセットボタン+min/max入力)、サイズ・地域・コンディション(Checkbox)、販売状況。適用で `router.push('/search?' + qs)`
- 適用中条件のチップ行(個別 ✕ / すべてクリア)
- `SortSelect`(client): Select 変更で qs 更新(page リセット)
- ページネーション: スマホ=「もっと見る」(`page+1` へのリンクを `<Link>` で追加描画する CSR 積み増しはせず、シンプルに次ページ遷移+ページ番号。実装簡略化のため**両デバイスともページ番号式**とし、スマホは前後ボタンのみ表示)
- 0 件時: 空状態イラスト(アイコン)+「条件を変えてお試しください」+クリアボタン
- `generateMetadata` でタイトルに検索条件を反映

## T-4.3 商品カード・グリッド

- `src/components/listing/listing-card.tsx`: 正方形サムネ(`aspect-square`, next/image, listingImageUrl w=600)、タイトル 2 行省略、価格(太字・`tabular-nums`)、地域、trading/sold バッジ(画像左上)、お気に入りボタン(右下、T-4.6)
- `listing-grid.tsx`: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3`

## T-4.4 ホーム(S-01)

- `/(public)/page.tsx`: 検索バー(ヘッダーと重複するためスマホのみ大きく表示)→ カテゴリグリッド(8 アイコン、`/search?category=` へ)→ 新着 12 件 → 人気(favorites_count 上位)12 件 → 「すべて見る」リンク

## T-4.5 商品詳細(S-03)

- `/(public)/items/[id]/page.tsx`: RLS により draft/withdrawn/suspended は本人・admin 以外 404(`.single()` エラー → notFound())
- `ImageSlider`(client): CSS scroll-snap の横スクロール+ドットインジケータ+PC は前後矢印とサムネイルストリップ。タップで Dialog 全画面(pinch はブラウザ標準に委ねる)
- スペック表: `<dl>` を 2 カラム(スマホ 1 カラム)。未入力項目は行ごと非表示。ラベルは constants から
- 出品者カード: Avatar・表示名・所在地・平均★と件数(reviews 集計クエリ)→ `/users/[id]`
- アクションバー: スマホは `fixed bottom-0`(タブバーの上)に価格+主ボタン、PC は右カラムに配置
  - 主ボタン分岐: 本人→「編集する」/ published→「購入手続きへ」(`/items/[id]/purchase`、Phase 6 までは disabled+「準備中」)/ trading→disabled「取引中」/ sold→disabled「SOLD」
  - サブ: お気に入り・「出品者に質問」(Phase 5 まで disabled)・通報(Phase 7 まで非表示)
- 同一出品者の他商品 6 件(published のみ、自分自身を除外)

## T-4.6 お気に入り(FR-06)

- `src/features/favorite/actions.ts#toggleFavorite(listingId)`: 未ログイン→`/login?next=` へ redirect。自分の出品は拒否。INSERT or DELETE(favorites_count はトリガーが同期)→ `revalidatePath`
- `favorite-button.tsx`(client): `useOptimistic` で即時トグル、ハートの塗り切替、件数表示(詳細のみ)
- `/(member)/mypage/favorites/page.tsx`(M-12): 登録日時降順グリッド。sold/withdrawn/suspended の商品はカードに状態を重畳表示

## T-4.7 公開プロフィールの出品グリッド接続

- T-2.6 の `/users/[id]` に listing-grid を接続(published のみ)

## T-4.8 ユニットテスト

- searchParams 正規化(不正値→デフォルト、空配列除去)
- キーワード分割(全角スペース対応 `q.split(/[\s　]+/)`)
- カードの状態バッジ出し分け(純関数 `listingBadge(status)`)

## フェーズ完了条件

- [ ] キーワード+複合絞り込み+並び替え+ページ送りが URL 共有で再現できる
- [ ] ゲストで一覧・詳細閲覧、会員でお気に入り登録/解除・一覧表示ができる
- [ ] 画像スライダーがスワイプ(スマホ)/矢印(PC)で動作、全画面表示できる
- [ ] 375px で 2 列・下部固定購入バー、1280px で 4 列・右カラム配置になる
- [ ] 5,000 件ダミーデータ投入スクリプト(`scripts/seed-dev.ts`, faker 使用)で一覧が 1 秒程度で応答する
- [ ] 品質ゲート成功
