-- =============================================================
-- 受渡方法に「配送(着払い)」を足す(甲の依頼)
--
-- 'shipping'         配送(送料込み)  … 出品者が送料を負担する
-- 'shipping_collect' 配送(着払い)    … 購入者が受け取り時に配送業者へ送料を払う
-- 'in_person'        対面(手渡し)
--
-- 着払いの送料はサイトの決済を通らない(購入者と配送業者の間で払う)。
-- サイトで支払うのは商品代金だけで、手数料の計算も変わらない。
--
-- 値は src/lib/constants.ts の DELIVERY_METHODS と揃える。
-- 制約名は schema.sql の列制約に Postgres が付けた既定の名前。
-- =============================================================

alter table public.listings drop constraint if exists listings_delivery_method_check;
alter table public.listings
  add constraint listings_delivery_method_check
  check (delivery_method in ('shipping', 'shipping_collect', 'in_person'));
