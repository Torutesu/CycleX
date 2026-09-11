-- issue #9: レート制限を原子的にする
-- issue #10: Stripe のイベント ID を記録して再送を追跡できるようにする

-- -------------------------------------------------------------
-- #9 レート制限
--
-- 旧実装は対象テーブル(messages / reports / listings)の直近レコードを数え、
-- そのあと呼び出し側が INSERT していた。数えてから書くまでの間に別の
-- リクエストが入れるため、同時アクセスでは上限を超えられた。
-- また DB エラー時は通過させていたので、判定できないときは無制限だった。
--
-- 判定と記録を 1 つの関数にまとめ、キーごとに助言ロックで直列化する。
-- これで並列でも上限を超えない。認証系(ログイン・登録・再設定・確認メール)は
-- そもそもユーザー行が無いので、この汎用カウンタでしか数えられない。
-- -------------------------------------------------------------

create table if not exists public.rate_limit_hits (
  id bigserial primary key,
  -- 制限の種類(message_send, auth_login など)
  bucket text not null,
  -- 制限の単位。利用者 ID、メールアドレスのハッシュ、IP など
  key text not null,
  created_at timestamptz not null default now()
);

-- 判定は (bucket, key, created_at) で引く。掃除は created_at で引く
create index if not exists idx_rate_limit_hits_lookup
  on public.rate_limit_hits (bucket, key, created_at desc);
create index if not exists idx_rate_limit_hits_created
  on public.rate_limit_hits (created_at);

alter table public.rate_limit_hits enable row level security;
-- 利用者からは一切触らせない(service_role のみ)
revoke all on public.rate_limit_hits from public, anon, authenticated;
revoke all on sequence public.rate_limit_hits_id_seq from public, anon, authenticated;
grant select, insert, delete on public.rate_limit_hits to service_role;
grant usage on sequence public.rate_limit_hits_id_seq to service_role;

/**
 * 制限を 1 回消費する。許可したら true、上限に達していたら false。
 *
 * 同じキーの同時実行は助言ロックで直列化するので、
 * 「数えてから書くまでに割り込まれる」余地が無い。
 * ロックはトランザクション終了で自動的に解放される。
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public as $$
declare
  v_used integer;
begin
  if p_limit <= 0 then
    return false;
  end if;

  -- キー単位で直列化する。bucket と key を混ぜて衝突しにくくする
  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_key, 0));

  select count(*) into v_used
    from public.rate_limit_hits
   where bucket = p_bucket
     and key = p_key
     and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_used >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket, key) values (p_bucket, p_key);
  return true;
end $$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

/**
 * 古い記録を捨てる(日次バッチから呼ぶ)。
 * 窓を過ぎた記録は判定に使わないので、残しておく意味がない。
 */
create or replace function public.prune_rate_limit_hits(p_older_than_hours integer default 48)
returns integer
language plpgsql
security definer
set search_path = public as $$
declare
  v_removed integer;
begin
  delete from public.rate_limit_hits
   where created_at < now() - make_interval(hours => p_older_than_hours);
  get diagnostics v_removed = row_count;
  return v_removed;
end $$;

revoke all on function public.prune_rate_limit_hits(integer) from public, anon, authenticated;
grant execute on function public.prune_rate_limit_hits(integer) to service_role;

-- -------------------------------------------------------------
-- #10 Stripe イベントの記録
--
-- 署名検証と「遷移前の status を条件に含める」実装で二重処理は防げているが、
-- 処理済みの event.id を残していないため、再送や重複配信を後から追えなかった。
-- 主キー衝突で重複を検出し、いつ何を受けたかを残す。
-- -------------------------------------------------------------

create table if not exists public.stripe_events (
  -- Stripe の event.id(evt_...)。重複配信はここで弾く
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  -- ハンドラが返した結果(paid, already_processed など)。失敗時は null
  outcome text,
  transaction_id uuid references public.transactions (id) on delete set null
);

create index if not exists idx_stripe_events_received on public.stripe_events (received_at desc);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;
grant select, insert, update on public.stripe_events to service_role;

-- -------------------------------------------------------------
-- #19 並び替えに索引を合わせる
--
-- 既存の idx_listings_status_published は (status, published_at desc) だが、
-- 実際の ORDER BY は `published_at desc nulls last, id` で、
-- NULLS の扱いとタイブレークが一致しないため索引が使われていなかった。
-- 10 万件で計測すると、深いページ(offset 50,000)は Seq Scan +
-- ディスクへの外部ソートで 48.5ms。ORDER BY に合わせた索引を張ると 8.9ms、
-- 1 ページ目は 0.1ms になる。
--
-- キーワード検索そのものは既存の trgm GIN 索引が効いている
-- (選択性の高い語で 0.3ms、Bitmap Index Scan を使用)。
-- -------------------------------------------------------------

-- 既定の並び(新着順)
create index if not exists idx_listings_sort_new
  on public.listings (status, published_at desc nulls last, id);

-- 価格の昇順・降順
create index if not exists idx_listings_sort_price_asc
  on public.listings (status, price asc nulls last, id);
create index if not exists idx_listings_sort_price_desc
  on public.listings (status, price desc nulls last, id);

-- 人気順(お気に入り数 → 新着)
create index if not exists idx_listings_sort_popular
  on public.listings (status, favorites_count desc, published_at desc nulls last, id);
