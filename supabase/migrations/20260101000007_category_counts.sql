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

-- 引数名や戻り値の列が違う同名の関数が既にあると、create or replace は
-- 置き換えを拒否する(42P13)。本番には、このリポジトリの外で作られた
-- 引数名の違う版が残っていたため、作る前に一度落とす。
-- この関数はアプリから直接呼ぶだけで、ほかの DB オブジェクトは依存していない。
-- cascade は付けない(依存が見つかったら、黙って消さずにエラーで止める)。
drop function if exists public.category_listing_counts();
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
