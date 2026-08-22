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
