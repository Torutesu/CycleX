-- =============================================================
-- スレッド一覧を1回の問い合わせで組み立てる
--
-- 背景:
--   一覧は「自分が当事者のスレッド」を集めたあと、
--   messages?thread_id=in.(...) で全メッセージを引いて、
--   最終メッセージと未読数をアプリ側で数えていた。
--   スレッドが増えるほど本文を丸ごと運ぶことになり、
--   URL に ID が並んで長さの上限にも近づく。
--
-- 方針:
--   最終メッセージと未読数はデータベース側で求め、
--   1スレッド1行だけを返す。
--
--   他人の未読数まで数えられてしまわないよう、
--   unread_message_count と同じく service role からのみ実行できる。
--   呼び出し側(Server Component)は本人であることを確認済み。
-- =============================================================
create or replace function public.thread_summaries(target_user uuid)
returns table (
  thread_id uuid,
  last_message_at timestamptz,
  listing_id uuid,
  listing_title text,
  listing_price int,
  listing_status text,
  thumbnail_path text,
  counterparty_id uuid,
  counterparty_name text,
  counterparty_avatar text,
  counterparty_status text,
  last_body text,
  last_created_at timestamptz,
  last_from_me boolean,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.last_message_at,
    l.id,
    l.title,
    l.price,
    l.status,
    (
      select li.path
      from public.listing_images li
      where li.listing_id = l.id
      order by li.position
      limit 1
    ),
    other.id,
    -- 退会などで相手の行が引けない場合の表示は呼び出し側で決める
    other.display_name,
    other.avatar_url,
    other.status,
    last_message.body,
    last_message.created_at,
    last_message.sender_id = target_user,
    coalesce(unread.count, 0)
  from public.threads t
  join public.listings l on l.id = t.listing_id
  left join public.users other
    on other.id = case when t.buyer_id = target_user then l.seller_id else t.buyer_id end
  left join lateral (
    select m.body, m.created_at, m.sender_id
    from public.messages m
    where m.thread_id = t.id
    order by m.created_at desc
    limit 1
  ) last_message on true
  left join lateral (
    select count(*)::bigint as count
    from public.messages m
    where m.thread_id = t.id
      and m.read_at is null
      and m.sender_id <> target_user
  ) unread on true
  where t.buyer_id = target_user or l.seller_id = target_user
  order by t.last_message_at desc nulls last;
$$;

comment on function public.thread_summaries(uuid) is
  'メッセージ一覧に出すスレッドの要約。service role からのみ実行できる。';

revoke execute on function public.thread_summaries(uuid) from public, anon, authenticated;
grant execute on function public.thread_summaries(uuid) to service_role;
