-- =============================================================
-- Row Level Security
-- 方針: RLS は「閲覧制御」を担い、状態遷移の正しさは Server Action 側で担保する。
-- 業務ロジックを伴う書き込み(取引・メッセージ・管理操作)は service role 経由。
-- =============================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
     where id = auth.uid() and role = 'admin' and status = 'active'
  )
$$;

alter table public.users enable row level security;
alter table public.brands enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_events enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.email_logs enable row level security;

-- -------------------------------------------------------------
-- users: プロフィールは公開情報。個人情報(email)は取得列をアプリ側で絞る。
-- -------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (true);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- -------------------------------------------------------------
-- brands
-- -------------------------------------------------------------
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select using (true);

drop policy if exists brands_admin_all on public.brands;
create policy brands_admin_all on public.brands
  for all using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- listings
-- -------------------------------------------------------------
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings
  for select using (
    status in ('published','trading','sold')
    or seller_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert with check (seller_id = auth.uid());

drop policy if exists listings_update_own on public.listings;
create policy listings_update_own on public.listings
  for update using (seller_id = auth.uid() and status <> 'suspended')
  with check (seller_id = auth.uid());

drop policy if exists listings_admin_update on public.listings;
create policy listings_admin_update on public.listings
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists listings_delete_draft on public.listings;
create policy listings_delete_draft on public.listings
  for delete using (seller_id = auth.uid() and status = 'draft');

-- -------------------------------------------------------------
-- listing_images: 親 listing の可視性に追従
-- -------------------------------------------------------------
drop policy if exists listing_images_select on public.listing_images;
create policy listing_images_select on public.listing_images
  for select using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.status in ('published','trading','sold') or l.seller_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists listing_images_write_own on public.listing_images;
create policy listing_images_write_own on public.listing_images
  for all using (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  );

-- -------------------------------------------------------------
-- favorites: 本人のみ。件数表示は listings.favorites_count を使う。
-- -------------------------------------------------------------
drop policy if exists favorites_all_own on public.favorites;
create policy favorites_all_own on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -------------------------------------------------------------
-- threads / messages: 参加者(出品者 or buyer)と admin
-- -------------------------------------------------------------
drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists threads_insert_buyer on public.threads;
create policy threads_insert_buyer on public.threads
  for insert with check (buyer_id = auth.uid());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.threads t
       where t.id = thread_id
         and (
           t.buyer_id = auth.uid()
           or exists (select 1 from public.listings l where l.id = t.listing_id and l.seller_id = auth.uid())
           or public.is_admin()
         )
    )
  );

-- -------------------------------------------------------------
-- transactions: 当事者と admin(作成・更新は service role のみ)
-- -------------------------------------------------------------
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select using (
    buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
  );

drop policy if exists transaction_events_select on public.transaction_events;
create policy transaction_events_select on public.transaction_events
  for select using (
    exists (
      select 1 from public.transactions tx
       where tx.id = transaction_id
         and (tx.buyer_id = auth.uid() or tx.seller_id = auth.uid() or public.is_admin())
    )
  );

-- -------------------------------------------------------------
-- reviews: 公開済みは全員。未公開は評価者本人と admin のみ(報復評価抑止)
-- -------------------------------------------------------------
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select using (
    (is_published and not is_hidden)
    or reviewer_id = auth.uid()
    or public.is_admin()
  );

-- -------------------------------------------------------------
-- reports
-- -------------------------------------------------------------
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- email_logs: admin のみ閲覧可
-- -------------------------------------------------------------
drop policy if exists email_logs_admin_select on public.email_logs;
create policy email_logs_admin_select on public.email_logs
  for select using (public.is_admin());

-- =============================================================
-- ロール権限(GRANT)
--
-- RLS を有効にしただけではアクセスできない。テーブル権限を付与したうえで、
-- 実際の可否は上記ポリシーが決める(権限 AND ポリシーの二段構え)。
-- =============================================================

grant usage on schema public to anon, authenticated, service_role;

-- service_role は RLS をバイパスするが、テーブル権限は別途必要。
-- 業務ロジック(取引遷移・Webhook・管理操作)はこのロールで実行する。
grant all on all tables in schema public to service_role;

-- 閲覧は全テーブルに許可し、範囲は RLS ポリシーで絞る
grant select on all tables in schema public to anon, authenticated;

-- ログインユーザー自身の操作として許可するもの
grant update on public.users to authenticated;
grant insert, update, delete on public.listings to authenticated;
grant insert, update, delete on public.listing_images to authenticated;
grant insert, delete on public.favorites to authenticated;
grant insert on public.threads to authenticated;
grant insert, update on public.reports to authenticated;

-- 管理者操作(ポリシー側で is_admin() を要求している)
grant insert, update, delete on public.brands to authenticated;

-- 以降のマイグレーションで追加されるテーブルにも既定の権限を付与する
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
