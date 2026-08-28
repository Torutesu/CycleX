-- =============================================================
-- 検索インデックスの張り直し(S2-1)と、利用停止の復帰情報(S2-6)
-- =============================================================

-- -------------------------------------------------------------
-- 1. キーワード検索のインデックスを列ごとに張り直す
--
-- 旧 idx_listings_trgm は 4 列を連結した式に対する GIN インデックスだった。
-- 一方アプリの検索は `title ILIKE '%x%' OR description ILIKE '%x%' OR ...` と
-- 列ごとに評価するため、連結式のインデックスは一度も使われず全件走査になっていた。
-- 検索の書き方に合わせて列ごとに張り直す。
-- -------------------------------------------------------------
drop index if exists public.idx_listings_trgm;

create index idx_listings_title_trgm
  on public.listings using gin (title gin_trgm_ops);

create index idx_listings_description_trgm
  on public.listings using gin (description gin_trgm_ops);

create index idx_listings_model_name_trgm
  on public.listings using gin (model_name gin_trgm_ops);

create index idx_listings_brand_other_trgm
  on public.listings using gin (brand_other gin_trgm_ops);

-- -------------------------------------------------------------
-- 2. 利用停止に伴って非表示にした出品を、解除時に元へ戻せるようにする
--
-- 従来は停止時に一律 status='suspended' へ倒していたため、
--   - 解除しても出品は非表示のままで、出品者は自分では戻せない
--     (canEditListing が suspended を編集不可としているため)
--   - 管理者が 1 件ずつ解除するしかなく、出品数が多いと運用が回らない
--   - 解除すると元が下書き・取下げ中でも一律「公開中」になってしまう
-- という問題があった。
--
-- 停止直前の状態を控えておき、
-- 「利用停止に伴って隠したもの」と「運営が個別に隠したもの」を区別する。
-- 後者は status_before_suspend が null のままなので一括復帰の対象にならない。
-- -------------------------------------------------------------
alter table public.listings
  add column status_before_suspend text
    check (status_before_suspend in ('draft', 'published', 'withdrawn'));

comment on column public.listings.status_before_suspend is
  '利用者の利用停止に伴って非表示にしたときの、直前のステータス。'
  '解除時にこの値へ戻す。運営が個別に非表示にした場合は null のままにする。';

-- 一括復帰の対象を引くための部分インデックス
create index idx_listings_suspended_restorable
  on public.listings (seller_id)
  where status = 'suspended' and status_before_suspend is not null;
