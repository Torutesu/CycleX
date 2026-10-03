#!/usr/bin/env bash
# 本番セットアップ SQL(supabase/setup-hosted.sql)が、次の2つの状況で通るかを確かめる。
#
#   1. 更地のデータベースに、続けて3回流す
#   2. 引数名や戻り値の列が違う同名の関数が、すでに残っているデータベースに流す
#
# 2 は実際に本番で起きた。リポジトリの外で作られた unread_message_count(p_user uuid)
# が残っていて、create or replace が置き換えを拒否した(42P13)。
# 自分の SQL で作ったデータベースにだけ流して「何度でも通る」と確かめても、
# この失敗は見つからない。
#
# ローカルの Supabase(supabase start)が動いている前提。CI の E2E ジョブでも使う。
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_CycleX}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/supabase/setup-hosted.sql"
BASE="$(mktemp)"
trap 'rm -f "$BASE"; psql_admin -c "drop database if exists hosted_fresh;" -c "drop database if exists hosted_drift;" >/dev/null 2>&1 || true' EXIT

# 「既にあるので飛ばした」という NOTICE は何度でも流せる作りの結果なので、出さない
QUIET=(-e PGOPTIONS="-c client_min_messages=warning")
psql_admin() { docker exec -i "${QUIET[@]}" "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_db() { local db="$1"; shift; docker exec -i "${QUIET[@]}" "$DB_CONTAINER" psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }

# 本番と同じく、auth / storage / extensions は Supabase が用意済みの状態から始める
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres \
  --schema=auth --schema=storage --schema=extensions > "$BASE"

fresh_db() {
  psql_admin -c "drop database if exists $1;" -c "create database $1;" >/dev/null
  # 所有者の付け替えなど、土台の復元で出る警告は本題ではないので捨てる
  docker exec -i "$DB_CONTAINER" psql -U postgres -d "$1" -q < "$BASE" >/dev/null 2>&1 || true
}

echo "1. 更地に続けて3回流す"
fresh_db hosted_fresh
for pass in 1 2 3; do
  psql_db hosted_fresh < "$SQL" >/dev/null
  echo "   ${pass} 回目: OK"
done

echo "2. 引数名や戻り値がずれた関数が残っている状態に流す"
fresh_db hosted_drift
psql_db hosted_drift < "$SQL" >/dev/null
psql_db hosted_drift <<'SQL'
drop function public.unread_message_count(uuid);
create function public.unread_message_count(p_user uuid) returns bigint language sql as $$ select 0::bigint $$;
drop function public.listing_status_counts(uuid);
create function public.listing_status_counts(p_seller uuid) returns table (st text, n bigint) language sql as $$ select null::text, 0::bigint $$;
drop function public.category_listing_counts();
create function public.category_listing_counts() returns table (cat text, total int) language sql as $$ select null::text, 0 $$;
drop function public.thread_summaries(uuid);
create function public.thread_summaries(p_user uuid) returns table (thread_id uuid) language sql as $$ select null::uuid $$;
SQL
psql_db hosted_drift < "$SQL" >/dev/null
echo "   OK"

# 作り直したあとも、他人の未読数を覗ける関数がブラウザの鍵から呼べないこと
leaked=$(docker exec "$DB_CONTAINER" psql -U postgres -d hosted_drift -tAc "
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('unread_message_count', 'thread_summaries')
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));")
if [ "$leaked" != "0" ]; then
  echo "   NG: 未読数・スレッド一覧の関数がブラウザの鍵から呼べる状態になっている" >&2
  exit 1
fi
echo "3. 未読数・スレッド一覧の関数は service_role 以外から呼べない: OK"
