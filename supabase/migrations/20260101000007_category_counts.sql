-- =============================================================
-- カテゴリ別の出品件数を1回の問い合わせで返す
--
-- 背景:
--   ホームのカテゴリ導線は、カテゴリごとに件数を出している。
--   これをアプリ側で数えると、カテゴリの数だけ COUNT が飛ぶ(現状8回)。
--   ローカルでは速いが、ホスト環境では1往復ごとに遅延が乗り、
--   もっとも見られる画面で接続を8本も使ってしまう。
--
-- 方針:
--   1回で全カテゴリぶんを返す関数にする。
--   security invoker(既定)なので、呼び出した利用者の権限と RLS がそのまま効く。
-- =============================================================

create or replace function public.category_listing_counts()
returns table (category text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select l.category, count(*)::bigint
  from public.listings l
  where l.status in ('published', 'trading')
  group by l.category;
$$;

comment on function public.category_listing_counts() is
  'カテゴリ別の公開中・取引中の件数。ホームのカテゴリ導線で使う。';

grant execute on function public.category_listing_counts() to anon, authenticated, service_role;
