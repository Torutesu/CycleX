-- =============================================================
-- touch_updated_at の search_path 固定
--
-- トリガー関数は呼び出し側の search_path で解決されるため、
-- pg_temp などに同名関数を置かれるとそちらが実行されうる。
-- 他の関数と同じく search_path を public に固定する。
-- =============================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;
