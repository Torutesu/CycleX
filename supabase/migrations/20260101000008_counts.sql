-- =============================================================
-- 件数の数え上げを1回にまとめる
--
-- 背景:
--   1) 出品管理のタブは状態ごとに COUNT を投げており、1画面で6往復していた。
--   2) 未読バッジは「自分が当事者のスレッド」を全部引いてから
--      messages?thread_id=in.(...) で数えていた。往復が3回かかるうえ、
--      やり取りが増えると URL に ID が並び、いずれ長さの上限に当たる。
--
-- 方針:
--   どちらも1回の問い合わせで済む関数にする。
-- =============================================================

-- -------------------------------------------------------------
-- 出品者ごとの、状態別の件数
--
-- security invoker のままなので、他人の ID を渡しても
-- RLS で見えるぶん(公開中・取引中)しか数えられない。
-- -------------------------------------------------------------
create or replace function public.listing_status_counts(seller uuid)
returns table (status text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select l.status, count(*)::bigint
  from public.listings l
  where l.seller_id = seller
  group by l.status;
$$;

comment on function public.listing_status_counts(uuid) is
  '出品者の状態別の件数。出品管理のタブに出す。';

grant execute on function public.listing_status_counts(uuid) to anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 未読メッセージの件数
--
-- 相手の未読数まで数えられてしまわないよう、service role からのみ実行できる。
-- 呼び出し側(Server Component)は本人であることを確認済み。
-- -------------------------------------------------------------
create or replace function public.unread_message_count(target_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.messages m
  join public.threads t on t.id = m.thread_id
  join public.listings l on l.id = t.listing_id
  where m.read_at is null
    and m.sender_id <> target_user
    and (t.buyer_id = target_user or l.seller_id = target_user);
$$;

comment on function public.unread_message_count(uuid) is
  '未読メッセージ数。ヘッダーとタブのバッジに出す。service role からのみ実行できる。';

revoke execute on function public.unread_message_count(uuid) from public, anon, authenticated;
grant execute on function public.unread_message_count(uuid) to service_role;
