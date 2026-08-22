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
create policy users_select on public.users
  for select using (true);

create policy users_update_self on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- -------------------------------------------------------------
-- brands
-- -------------------------------------------------------------
create policy brands_select on public.brands
  for select using (true);

create policy brands_admin_all on public.brands
  for all using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- listings
-- -------------------------------------------------------------
create policy listings_select on public.listings
  for select using (
    status in ('published','trading','sold')
    or seller_id = auth.uid()
    or public.is_admin()
  );

create policy listings_insert_own on public.listings
  for insert with check (seller_id = auth.uid());

create policy listings_update_own on public.listings
  for update using (seller_id = auth.uid() and status <> 'suspended')
  with check (seller_id = auth.uid());

create policy listings_admin_update on public.listings
  for update using (public.is_admin()) with check (public.is_admin());

create policy listings_delete_draft on public.listings
  for delete using (seller_id = auth.uid() and status = 'draft');

-- -------------------------------------------------------------
-- listing_images: 親 listing の可視性に追従
-- -------------------------------------------------------------
create policy listing_images_select on public.listing_images
  for select using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.status in ('published','trading','sold') or l.seller_id = auth.uid() or public.is_admin())
    )
  );

create policy listing_images_write_own on public.listing_images
  for all using (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  );

-- -------------------------------------------------------------
-- favorites: 本人のみ。件数表示は listings.favorites_count を使う。
-- -------------------------------------------------------------
create policy favorites_all_own on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -------------------------------------------------------------
-- threads / messages: 参加者(出品者 or buyer)と admin
-- -------------------------------------------------------------
create policy threads_select on public.threads
  for select using (
    buyer_id = auth.uid()
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
    or public.is_admin()
  );

create policy threads_insert_buyer on public.threads
  for insert with check (buyer_id = auth.uid());

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
create policy transactions_select on public.transactions
  for select using (
    buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
  );

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
create policy reviews_select on public.reviews
  for select using (
    (is_published and not is_hidden)
    or reviewer_id = auth.uid()
    or public.is_admin()
  );

-- -------------------------------------------------------------
-- reports
-- -------------------------------------------------------------
create policy reports_select on public.reports
  for select using (reporter_id = auth.uid() or public.is_admin());

create policy reports_insert_own on public.reports
  for insert with check (reporter_id = auth.uid());

create policy reports_admin_update on public.reports
  for update using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- email_logs: admin のみ閲覧可
-- -------------------------------------------------------------
create policy email_logs_admin_select on public.email_logs
  for select using (public.is_admin());
