# Phase 1: 基盤構築(20h)

ゴール: 開発環境・DB スキーマ・RLS・シード・CI が整い、`pnpm dev` でトップページ(仮)が表示される。

## T-1.1 プロジェクト雛形

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
pnpm dlx shadcn@latest init      # style: default / base color: neutral / CSS variables: yes
pnpm add @supabase/supabase-js @supabase/ssr stripe resend zod react-hook-form @hookform/resolvers date-fns
pnpm add -D vitest @vitejs/plugin-react @playwright/test prettier supabase
```

- shadcn/ui コンポーネントを追加: `button input textarea select label form card badge tabs dialog sheet dropdown-menu avatar skeleton sonner separator radio-group checkbox pagination table alert`
- `prettier` 設定、`package.json` scripts:
  `dev / build / lint / typecheck (tsc --noEmit) / test (vitest run) / test:e2e (playwright test) / db:push / db:types (supabase gen types typescript --local > src/types/database.ts)`
- `.env.example` を [00_execution_guide.md](00_execution_guide.md) §4 の内容で作成
- `src/app/globals.css` にブランドトークン(primary: teal 系 `#0E7C6B`)を CSS 変数で設定(shadcn のテーマ変数を上書き)

**検証**: `pnpm dev` で起動、`pnpm build` 成功。

## T-1.2 定数モジュール `src/lib/constants.ts`

以下をすべて `{ value, label }[]` 形式(表示名は日本語)で定義し、Zod の enum と共有する:

- `CATEGORIES`: road / cross / mtb / city / minivelo / ebike / parts / other
- `PARTS_SUBCATEGORIES`: frame / wheel / component / cockpit / saddle / pedal / tire / accessory / other
- `CONDITIONS`: new / like_new / good / fair / poor / junk(表示: 新品・未使用 〜 全体的に状態が悪い)
- `MILEAGES`: lte100 / lte500 / lte1000 / lte3000 / lte5000 / gt5000 / unknown
- `FRAME_SIZES`: XS / S / M / L / XL / other
- `COMPONENTS`: Shimano(Claris/Sora/Tiagra/105/Ultegra/Dura-Ace/Deore/SLX/XT/XTR)、SRAM(Apex/Rival/Force/Red/NX/GX/X01/XX1)、Campagnolo(Centaur/Chorus/Record/Super Record)、other / unknown
- `PREFECTURES`: JIS X 0401 コード '01'〜'47' と名称の 47 件全部
- `DELIVERY_METHODS`: shipping(配送(送料込み))/ in_person(対面(手渡し))
- `LISTING_STATUSES` / `TRANSACTION_STATUSES` / `REPORT_REASONS`(表示名付き)
- `PRICE_MIN = 300`, `PRICE_MAX = 9_999_999`, `MAX_IMAGES = 10`, `PAGE_SIZE = 24`

## T-1.3 Supabase セットアップとマイグレーション

`supabase init` 後、`supabase/migrations/0001_schema.sql` を作成。**以下の SQL を正とする**(全文):

```sql
-- extensions
create extension if not exists pg_trgm;

-- ===== users =====
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
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auth.users への INSERT で public.users を自動作成
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name, email_verified_at)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', 'ユーザー'),
    new.email_confirmed_at
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- メール確認の同期
create or replace function public.handle_user_email_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users set email = new.email, email_verified_at = new.email_confirmed_at, updated_at = now()
  where id = new.id;
  return new;
end $$;
create trigger on_auth_user_updated after update on auth.users
  for each row execute function public.handle_user_email_verified();

-- ===== brands =====
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== listings =====
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
  frame_size_cm numeric,
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
create index idx_listings_trgm on public.listings
  using gin ((coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(model_name,'') || ' ' || coalesce(brand_other,'')) gin_trgm_ops);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  path text not null,              -- Storage オブジェクトパス(URL はアプリで組み立て)
  position int not null check (position between 0 and 9),
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

-- ===== favorites =====
create table public.favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create or replace function public.sync_favorites_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set favorites_count = favorites_count + 1 where id = new.listing_id;
  else
    update public.listings set favorites_count = greatest(favorites_count - 1, 0) where id = old.listing_id;
  end if;
  return null;
end $$;
create trigger trg_favorites_count after insert or delete on public.favorites
  for each row execute function public.sync_favorites_count();

-- ===== threads / messages =====
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.users(id),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references public.users(id),
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_messages_thread on public.messages (thread_id, created_at);

-- ===== transactions =====
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
  paid_at timestamptz, shipped_at timestamptz, received_at timestamptz,
  completed_at timestamptz, canceled_at timestamptz,
  canceled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 1商品につき有効取引1件(canceled 以外)
create unique index uq_transactions_active on public.transactions (listing_id)
  where status <> 'canceled';
create index idx_transactions_buyer on public.transactions (buyer_id);
create index idx_transactions_seller on public.transactions (seller_id);

create table public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  actor_id uuid references public.users(id),
  event text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ===== reviews =====
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id),
  reviewer_id uuid not null references public.users(id),
  reviewee_id uuid not null references public.users(id),
  rating int not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  is_published boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (transaction_id, reviewer_id)
);
create index idx_reviews_reviewee on public.reviews (reviewee_id) where is_published and not is_hidden;

-- ===== reports =====
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

-- ===== email_logs =====
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  kind text not null,
  status text not null check (status in ('sent','failed')),
  error text,
  created_at timestamptz not null default now()
);

-- updated_at 自動更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text;
begin
  foreach t in array array['users','brands','listings','transactions','reports']
  loop
    execute format('create trigger trg_touch_%s before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
```

`supabase/migrations/0002_rls.sql`(全文):

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.users where id = auth.uid() and role = 'admin') $$;

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

-- users: 全員閲覧可(メール等の秘匿はビュー/クエリ側で列を絞る)、本人のみ更新
create policy users_select on public.users for select using (true);
create policy users_update on public.users for update using (auth.uid() = id);

-- brands: 閲覧は全員、書き込みは admin(通常は service role 経由)
create policy brands_select on public.brands for select using (true);
create policy brands_admin on public.brands for all using (public.is_admin());

-- listings
create policy listings_select on public.listings for select using (
  status in ('published','trading','sold')
  or seller_id = auth.uid()
  or public.is_admin()
);
create policy listings_insert on public.listings for insert with check (seller_id = auth.uid());
create policy listings_update on public.listings for update using (
  (seller_id = auth.uid() and status <> 'suspended') or public.is_admin()
);
create policy listings_delete on public.listings for delete using (
  seller_id = auth.uid() and status = 'draft'
);

-- listing_images: 親 listing の可視性に追従
create policy listing_images_select on public.listing_images for select using (
  exists (select 1 from public.listings l where l.id = listing_id
          and (l.status in ('published','trading','sold') or l.seller_id = auth.uid() or public.is_admin()))
);
create policy listing_images_write on public.listing_images for all using (
  exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
);

-- favorites: 本人のみ
create policy favorites_all on public.favorites for all using (user_id = auth.uid());
-- 件数表示は listings.favorites_count を参照するため他人の行の SELECT は不要

-- threads / messages: 参加者(出品者 or buyer)と admin
create policy threads_select on public.threads for select using (
  buyer_id = auth.uid()
  or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  or public.is_admin()
);
create policy threads_insert on public.threads for insert with check (buyer_id = auth.uid());
create policy messages_select on public.messages for select using (
  exists (select 1 from public.threads t where t.id = thread_id and (
    t.buyer_id = auth.uid()
    or exists (select 1 from public.listings l where l.id = t.listing_id and l.seller_id = auth.uid())
    or public.is_admin()))
);
-- INSERT / read_at 更新は Server Action(service role)経由のためポリシー不要

-- transactions: 当事者と admin(作成・更新は service role のみ)
create policy transactions_select on public.transactions for select using (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);
create policy transaction_events_select on public.transaction_events for select using (
  exists (select 1 from public.transactions tx where tx.id = transaction_id
          and (tx.buyer_id = auth.uid() or tx.seller_id = auth.uid() or public.is_admin()))
);

-- reviews: 公開済みは全員、未公開は評価者本人と admin
create policy reviews_select on public.reviews for select using (
  (is_published and not is_hidden) or reviewer_id = auth.uid() or public.is_admin()
);

-- reports: 本人の通報と admin
create policy reports_select on public.reports for select using (
  reporter_id = auth.uid() or public.is_admin()
);
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_admin_update on public.reports for update using (public.is_admin());

-- email_logs: admin のみ
create policy email_logs_admin on public.email_logs for select using (public.is_admin());
```

`supabase/migrations/0003_storage.sql`: バケット作成とポリシー

```sql
insert into storage.buckets (id, name, public) values
  ('listing-images', 'listing-images', true),
  ('avatars', 'avatars', true);

-- パス規約: listing-images/{userId}/{uuid}.{ext} / avatars/{userId}.{ext}
create policy "images_read" on storage.objects for select using (bucket_id in ('listing-images','avatars'));
create policy "images_insert_own" on storage.objects for insert with check (
  bucket_id in ('listing-images','avatars')
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "images_delete_own" on storage.objects for delete using (
  bucket_id in ('listing-images','avatars')
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

`supabase/seed.sql`:

- brands: Trek, Specialized, Giant, Cannondale, Bianchi, Pinarello, Colnago, Cervélo, Scott, Merida, BMC, Canyon, GIOS, RALEIGH, Brompton, DAHON, tern, FUJI, Shimano, SRAM, Campagnolo
- 開発用 admin 昇格 SQL のコメント例: `update public.users set role='admin' where email='...';`

`supabase/config.toml` の auth 設定: `enable_confirmations = true`(メール確認必須)、site_url とリダイレクト URL に `http://localhost:3000/auth/callback` を追加。Google プロバイダは環境構築時に有効化(ローカルはメール認証のみで開発可)。

**検証**: `supabase start && supabase db reset` がエラーなし。`pnpm db:types` で `src/types/database.ts` 生成。

## T-1.4 Supabase クライアント 3 種

- `src/lib/supabase/client.ts`: `createBrowserClient`(anon)
- `src/lib/supabase/server.ts`: `createServerClient`(cookies 連携、Server Component / Action 用)
- `src/lib/supabase/admin.ts`: `import "server-only"` + service role クライアント(`auth.persistSession: false`)
- `src/lib/supabase/middleware.ts`: セッションリフレッシュ用ヘルパー(公式パターン)
- `middleware.ts`(ルート): セッション更新+`/mypage|/sell|/messages|/transactions` 未ログイン→`/login?next=...`、`/admin` は `users.role` を確認し非 admin は 404

## T-1.5 CI(GitHub Actions)

`.github/workflows/ci.yml`: push/PR で `pnpm install → lint → typecheck → test → build`(Node 22 / pnpm キャッシュ)。環境変数はダミー値を注入して build を通す。

## フェーズ完了条件

- [ ] `supabase db reset` で 3 マイグレーション+シードが適用される
- [ ] 品質ゲート 4 コマンドすべて成功
- [ ] CI がグリーン
- [ ] `docs/plan/BACKLOG.md`(空)と `.env.example` が存在する
