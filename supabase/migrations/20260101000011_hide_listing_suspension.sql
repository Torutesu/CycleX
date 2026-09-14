-- =============================================================
-- listings.suspended_reason / status_before_suspend の非公開化
--
-- 非表示の理由は運営の内部情報であり、公開鍵(anon / authenticated)から
-- 読める状態だった。出品者本人にだけ届ければよい情報なので、
-- listings から列権限を外し、本人向けの読み取りはビュー経由にする。
-- 列権限は行を区別できないため、
-- 「自分の出品の理由だけ見える」はビューの WHERE で実現する。
-- =============================================================

-- テーブル全体の SELECT を引き上げ、公開してよい列だけを再許可する。
-- select("*") は権限のある列へ展開されるため、アプリ側の記述は変えなくてよい。
revoke select on public.listings from anon, authenticated;
grant select (
  id,
  seller_id,
  status,
  category,
  parts_subcategory,
  title,
  brand_id,
  brand_other,
  model_name,
  model_year,
  frame_size,
  frame_size_cm,
  component,
  component_note,
  mileage,
  condition,
  description,
  price,
  delivery_method,
  shipping_from_pref,
  meetup_pref,
  favorites_count,
  published_at,
  created_at,
  updated_at
) on public.listings to anon, authenticated;

-- 出品者本人(および service role = 管理画面)向けの理由の読み取り経路。
-- ビューは所有者(postgres)の権限で実行されるため、WHERE の
-- seller_id = auth.uid() がそのまま行の絞り込みになる。
-- security_barrier で、呼び出し側の条件が WHERE より先に
-- 他の行へ評価されるのを防ぐ。
create or replace view public.listing_suspension_reasons
with (security_barrier = on) as
select l.id as listing_id, l.suspended_reason
from public.listings l
where l.seller_id = auth.uid();

revoke select on public.listing_suspension_reasons from anon;
grant select on public.listing_suspension_reasons to authenticated;
