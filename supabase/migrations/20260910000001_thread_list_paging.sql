-- 監査 M-6: スレッド一覧が PostgREST の行上限(既定 1,000)で黙って打ち切られる。
--
-- thread_summaries は利用者の全スレッドを返すため、件数が上限を超えると
-- 古いスレッドの本文・未読件数が欠落したまま画面に出てしまう。
-- アプリ側の threads クエリにも順序も上限も無く、どのスレッドが落ちるかも不定だった。
--
-- 並び順(最終メッセージの新しい順)を SQL 側で確定させ、
-- limit / offset を受け取れるようにする。アプリはこれを使って
-- 50 件ずつ「さらに読み込む」形にする。

-- 引数が変わるので、まず旧シグネチャを落とす
drop function if exists public.thread_summaries(uuid);

create or replace function public.thread_summaries(
  p_user uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  thread_id uuid,
  last_body text,
  last_created_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql stable security definer set search_path = public as $$
  select t.id,
         m.body,
         m.created_at,
         m.sender_id,
         (select count(*) from public.messages x
           where x.thread_id = t.id and x.sender_id <> p_user and x.read_at is null)
    from public.threads t
    join public.listings l on l.id = t.listing_id
    left join lateral (
      select body, created_at, sender_id
        from public.messages
       where thread_id = t.id
       order by created_at desc
       limit 1
    ) m on true
   where t.buyer_id = p_user or l.seller_id = p_user
   -- 一覧の並び順は SQL 側で確定させる。同着はスレッド ID で安定させ、
   -- ページの境目で重複・欠落が出ないようにする
   order by t.last_message_at desc nulls last, t.id
   limit greatest(0, least(p_limit, 200))
  offset greatest(0, p_offset);
$$;

revoke all on function public.thread_summaries(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.thread_summaries(uuid, integer, integer) to service_role;

-- 参加スレッドを最終メッセージ順に引くための索引。
-- 買い手側は threads を直接絞れるが、出品者側は listings 経由になる
create index if not exists idx_threads_buyer_last_message
  on public.threads (buyer_id, last_message_at desc nulls last);
create index if not exists idx_threads_listing_last_message
  on public.threads (listing_id, last_message_at desc nulls last);
