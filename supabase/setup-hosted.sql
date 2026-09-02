-- ============================================================
-- CycleX 本番セットアップ(1回貼るだけ)
--
-- Supabase の SQL Editor に貼り付けて Run するだけで、
-- テーブル・権限・インデックス・Storage・初期データがすべて入る。
-- CLI のインストールもログインも不要。
--
-- 内容は supabase/migrations/ の6本 + seed.sql と同一。
-- 生成元: 5eaede7
-- ============================================================

-- 再実行できるよう、Storage のポリシーは先に落としておく
drop policy if exists "cyclex_images_read"        on storage.objects;
drop policy if exists "cyclex_images_insert_own"  on storage.objects;
drop policy if exists "cyclex_images_update_own"  on storage.objects;
drop policy if exists "cyclex_images_delete_own"  on storage.objects;


-- ############################################################
-- 20260101000001_schema.sql
-- ############################################################

-- =============================================================
-- CycleX スキーマ定義
-- docs/requirements/03_data_model.md / docs/plan/01_bootstrap.md に対応
-- =============================================================

create extension if not exists pg_trgm;

-- =============================================================
-- users
-- =============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text not null default '',
  avatar_url text,
  bio text,
  prefecture text check (prefecture ~ '^[0-4][0-9]$'),
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','suspended','withdrawn')),
  email_verified_at timestamptz,
  notification_prefs jsonb not null default '{}',
  suspended_reason text,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is '会員プロフィール。auth.users と 1:1。';

-- auth.users への INSERT で public.users を自動作成
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name, avatar_url, email_verified_at)
  values (
    new.id,
    new.email,
    left(
      coalesce(
        nullif(new.raw_user_meta_data->>'display_name', ''),
        nullif(new.raw_user_meta_data->>'full_name', ''),
        nullif(new.raw_user_meta_data->>'name', ''),
        'ユーザー'
      ),
      30
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    new.email_confirmed_at
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- メールアドレス変更・確認完了を public.users へ同期
create or replace function public.handle_user_email_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set email = new.email,
         email_verified_at = new.email_confirmed_at,
         updated_at = now()
   where id = new.id;
  return new;
end $$;

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_email_verified();

-- =============================================================
-- brands
-- =============================================================
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================
-- listings
-- =============================================================
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users(id),
  status text not null default 'draft'
    check (status in ('draft','published','trading','sold','withdrawn','suspended')),
  category text not null default 'other',
  parts_subcategory text,
  title text not null default '',
  brand_id uuid references public.brands(id),
  brand_other text,
  model_name text,
  model_year int check (model_year between 1980 and 2100),
  frame_size text,
  frame_size_cm numeric(4,1),
  component text,
  component_note text,
  mileage text,
  condition text,
  description text,
  price int check (price between 300 and 9999999),
  delivery_method text check (delivery_method in ('shipping','in_person')),
  shipping_from_pref text,
  meetup_pref text,
  favorites_count int not null default 0,
  published_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_listings_status_published on public.listings (status, published_at desc);
create index idx_listings_category on public.listings (category);
create index idx_listings_brand on public.listings (brand_id);
create index idx_listings_price on public.listings (price);
create index idx_listings_pref on public.listings (shipping_from_pref);
create index idx_listings_seller on public.listings (seller_id);
create index idx_listings_favorites on public.listings (favorites_count desc);

-- 日本語のキーワード検索は形態素解析を使わず pg_trgm の部分一致で行う
create index idx_listings_trgm on public.listings using gin (
  (
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(model_name, '') || ' ' ||
    coalesce(brand_other, '')
  ) gin_trgm_ops
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  path text not null,
  position int not null check (position between 0 and 9),
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

create index idx_listing_images_listing on public.listing_images (listing_id, position);

-- =============================================================
-- favorites
-- =============================================================
create table public.favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index idx_favorites_listing on public.favorites (listing_id);
create index idx_favorites_user_created on public.favorites (user_id, created_at desc);

create or replace function public.sync_favorites_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set favorites_count = favorites_count + 1 where id = new.listing_id;
  elsif tg_op = 'DELETE' then
    update public.listings set favorites_count = greatest(favorites_count - 1, 0) where id = old.listing_id;
  end if;
  return null;
end $$;

create trigger trg_favorites_count
  after insert or delete on public.favorites
  for each row execute function public.sync_favorites_count();

-- =============================================================
-- threads / messages
-- =============================================================
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.users(id),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);

create index idx_threads_buyer on public.threads (buyer_id, last_message_at desc);
create index idx_threads_listing on public.threads (listing_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references public.users(id),
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_messages_thread on public.messages (thread_id, created_at);
create index idx_messages_unread on public.messages (thread_id, sender_id) where read_at is null;

-- =============================================================
-- transactions
-- =============================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  seller_id uuid not null references public.users(id),
  buyer_id uuid not null references public.users(id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment','paid','shipped','received','completed','canceled')),
  price int not null,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  shipping_note text,
  paid_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  canceled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1商品につき有効な取引は同時に1件(二重購入の排他制御の本体)
create unique index uq_transactions_active on public.transactions (listing_id)
  where status <> 'canceled';

create index idx_transactions_buyer on public.transactions (buyer_id, created_at desc);
create index idx_transactions_seller on public.transactions (seller_id, created_at desc);
create index idx_transactions_status on public.transactions (status);

create table public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  actor_id uuid references public.users(id),
  event text not null,
  note text,
  created_at timestamptz not null default now()
);

create index idx_transaction_events_tx on public.transaction_events (transaction_id, created_at);

-- =============================================================
-- reviews
-- =============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  reviewer_id uuid not null references public.users(id),
  reviewee_id uuid not null references public.users(id),
  rating int not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  is_published boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (transaction_id, reviewer_id)
);

create index idx_reviews_reviewee on public.reviews (reviewee_id, created_at desc)
  where is_published and not is_hidden;

-- =============================================================
-- reports
-- =============================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id),
  target_type text not null check (target_type in ('listing','user')),
  target_id uuid not null,
  reason text not null check (reason in ('prohibited','fraud','inappropriate','tos_violation','other')),
  detail text check (char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_by uuid references public.users(id),
  resolved_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index idx_reports_status on public.reports (status, created_at desc);
create index idx_reports_target on public.reports (target_type, target_id);

-- =============================================================
-- email_logs
-- =============================================================
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  kind text not null,
  ref_id uuid,
  status text not null check (status in ('sent','failed')),
  error text,
  created_at timestamptz not null default now()
);

create index idx_email_logs_dedupe on public.email_logs (user_id, kind, ref_id, created_at desc);

-- =============================================================
-- updated_at 自動更新
-- =============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['users','brands','listings','transactions','reports']
  loop
    execute format(
      'create trigger trg_touch_%s before update on public.%I for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end $$;


-- ############################################################
-- 20260101000002_rls.sql
-- ############################################################

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


-- ############################################################
-- 20260101000003_storage.sql
-- ############################################################

-- =============================================================
-- Storage バケットとポリシー
-- パス規約:
--   listing-images/{userId}/{uuid}.{ext}
--   avatars/{userId}/{uuid}.{ext}
-- 先頭フォルダを所有者 ID とし、書き込みは本人のみに限定する。
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-images', 'listing-images', true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('avatars',        'avatars',        true, 5242880,  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "cyclex_images_read"
  on storage.objects for select
  using (bucket_id in ('listing-images','avatars'));

create policy "cyclex_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id in ('listing-images','avatars')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cyclex_images_update_own"
  on storage.objects for update
  using (
    bucket_id in ('listing-images','avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cyclex_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id in ('listing-images','avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ############################################################
-- 20260101000004_harden_grants.sql
-- ############################################################

-- =============================================================
-- テーブル権限の絞り込み(コードレビュー S1-0 / S1-1 の修正)
--
-- 背景:
--   20260101000002_rls.sql では anon / authenticated に対してテーブル単位で
--   SELECT・UPDATE を付与していた。RLS ポリシーは「どの行か」しか制御できず
--   「どの列か」は制御できないため、以下が可能になっていた。
--
--   1. 権限昇格: ログインユーザーが自分の行の role を 'admin' に更新できる。
--      status を 'active' に戻して利用停止を自力解除することもできた。
--   2. 個人情報の流出: anon key(ブラウザに配布される公開値)で
--      GET /rest/v1/users?select=email から全会員のメールアドレスを取得できた。
--
-- 方針:
--   - users は列単位の GRANT に置き換える。非公開列(email / role /
--     email_verified_at / notification_prefs / suspended_reason / withdrawn_at)は
--     anon・authenticated に一切見せない。
--   - 業務ロジックを伴う書き込み(出品・通報・スレッド・ブランド)は
--     すべて Server Action が service role で行っているため、
--     authenticated からの直接書き込み権限を剥奪する。
--   - favorites だけは Server Action が anon クライアントで書いているため権限を残し、
--     代わりに RLS 側で「公開中の他人の商品」に限定する。
-- =============================================================

-- -------------------------------------------------------------
-- users: 列単位の権限へ置き換える
-- -------------------------------------------------------------
revoke select, update on public.users from anon, authenticated;

-- 公開プロフィールとして表示してよい列のみ読ませる。
-- email / role / email_verified_at / notification_prefs / suspended_reason /
-- withdrawn_at / updated_at は含めない。
grant select (id, display_name, avatar_url, bio, prefecture, status, created_at)
  on public.users to anon, authenticated;

-- 本人が自分で変更してよい列のみ書かせる(行の限定は users_update_self が担う)。
grant update (display_name, avatar_url, bio, prefecture, notification_prefs)
  on public.users to authenticated;

-- -------------------------------------------------------------
-- 書き込みはすべて Server Action(service role)経由に統一する
--
-- ポリシー自体は多層防御として残すが、権限を落とすことで
-- PostgREST を直接叩く経路を塞ぐ。
-- -------------------------------------------------------------
revoke insert, update, delete on public.listings from authenticated;
revoke insert, update, delete on public.listing_images from authenticated;
revoke insert on public.threads from authenticated;
revoke insert, update on public.reports from authenticated;
revoke insert, update, delete on public.brands from authenticated;

-- -------------------------------------------------------------
-- favorites: 対象商品の条件を RLS で担保する
--
-- 旧ポリシーは user_id しか見ていなかったため、下書きや運営非表示の商品にも
-- お気に入りを付けられ、トリガー経由で favorites_count を動かせた。
-- -------------------------------------------------------------
drop policy if exists favorites_all_own on public.favorites;

create policy favorites_select_own on public.favorites
  for select using (user_id = auth.uid());

create policy favorites_insert_own on public.favorites
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.status in ('published', 'trading', 'sold')
         and l.seller_id <> auth.uid()
    )
  );

create policy favorites_delete_own on public.favorites
  for delete using (user_id = auth.uid());

-- -------------------------------------------------------------
-- listings.suspended_reason(運営の非表示理由)も本来は非公開列だが、
-- アプリ側に `select("*")` を使う画面が残っているため、ここでは扱わない。
-- 列単位に絞る場合は先に該当箇所を明示列指定へ直すこと。
--   - src/app/(member)/mypage/listings/page.tsx
--   - src/app/(member)/sell/[id]/edit/page.tsx
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- 以降に追加されるテーブルの既定権限は 20260101000002 のままでよい
-- (service_role = all / anon・authenticated = select)。
-- 新しいテーブルに非公開列を持たせる場合は、このファイルと同様に
-- 列単位の GRANT を明示すること。
-- =============================================================


-- ############################################################
-- 20260101000005_search_index_and_suspension.sql
-- ############################################################

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


-- ############################################################
-- 20260101000006_reports_and_audit.sql
-- ############################################################

-- =============================================================
-- 通報の重複制限の見直しと、管理操作の記録(S3-6 / S3-8)
-- =============================================================

-- -------------------------------------------------------------
-- 1. 通報: 同一対象への再通報を「未対応の間だけ」制限する
--
-- 旧制約 unique (reporter_id, target_type, target_id) は永久に効くため、
-- 一度通報した相手は運営の対応が終わったあとに再び問題を起こしても
-- 二度と通報できなかった。未対応(open)の通報が1件あるあいだだけ塞ぐ。
-- -------------------------------------------------------------
alter table public.reports
  drop constraint if exists reports_reporter_id_target_type_target_id_key;

create unique index uq_reports_open
  on public.reports (reporter_id, target_type, target_id)
  where status = 'open';

-- -------------------------------------------------------------
-- 2. 管理操作の記録
--
-- transaction_events は取引にしか残らないため、利用停止・非表示・ブランド変更
-- といった管理操作の履歴が残っていなかった。誰が何をしたかを追えるようにする。
-- -------------------------------------------------------------
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id),
  action text not null,
  target_type text not null check (target_type in ('user', 'listing', 'transaction', 'brand', 'report')),
  target_id uuid,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is
  '管理画面から行われた操作の記録。閲覧は管理者のみ。書き込みは Server Action(service role)から。';

create index idx_admin_audit_created on public.admin_audit_logs (created_at desc);
create index idx_admin_audit_target on public.admin_audit_logs (target_type, target_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

create policy admin_audit_admin_select on public.admin_audit_logs
  for select using (public.is_admin());

-- 20260101000002 の alter default privileges により、
-- service_role には all、anon/authenticated には select が自動で付与される。
-- 閲覧範囲は上記ポリシーが絞る。


-- ############################################################
-- 初期データ(ブランド一覧) / seed.sql
-- ############################################################

-- =============================================================
-- CycleX 初期データ
-- `supabase db reset` 実行時に自動適用される
-- =============================================================

insert into public.brands (name) values
  ('Trek'),
  ('Specialized'),
  ('Giant'),
  ('Cannondale'),
  ('Bianchi'),
  ('Pinarello'),
  ('Colnago'),
  ('Cervélo'),
  ('Scott'),
  ('Merida'),
  ('BMC'),
  ('Canyon'),
  ('GIOS'),
  ('RALEIGH'),
  ('Brompton'),
  ('DAHON'),
  ('tern'),
  ('FUJI'),
  ('ANCHOR'),
  ('KhodaaBloom'),
  ('NESTO'),
  ('LOUIS GARNEAU'),
  ('Panasonic'),
  ('YAMAHA'),
  ('BRIDGESTONE'),
  ('Shimano'),
  ('SRAM'),
  ('Campagnolo'),
  ('MAVIC'),
  ('FULCRUM')
on conflict (name) do nothing;

-- -------------------------------------------------------------
-- 管理者アカウントの作成手順(手動)
--
-- 1. アプリから通常の会員登録を行う
-- 2. 以下を実行してロールを昇格する
--
--    update public.users set role = 'admin' where email = 'admin@example.com';
--
-- 管理画面上での管理者追加 UI は MVP の対象外(別紙1 第3項)。
-- -------------------------------------------------------------
