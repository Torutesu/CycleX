-- =============================================================
-- Phase A: 本番運用に向けた堅牢化(docs/review/COMPLETION_PLAN.md §1)
-- =============================================================

-- A-3: メール送信ログに「未設定のためスキップ」を sent と区別して記録する
alter table public.email_logs drop constraint if exists email_logs_status_check;
alter table public.email_logs
  add constraint email_logs_status_check check (status in ('sent','failed','skipped'));

-- -------------------------------------------------------------
-- A-5: 利用停止中・退会済みのユーザーは、直接 PostgREST / Storage を叩いても
--      書き込めないようにする(アプリ側のガードに加えた多層防御)
-- -------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
     where id = auth.uid() and status = 'active'
  );
$$;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to anon, authenticated;

-- 本人のプロフィール更新は利用中(active)のときだけ
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update
  using (auth.uid() = id and status = 'active')
  with check (auth.uid() = id);

-- お気に入りの登録・解除も利用中のときだけ
drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own on public.favorites
  for insert with check (
    user_id = auth.uid()
    and public.is_active_user()
    and exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.status in ('published', 'trading', 'sold')
         and l.seller_id <> auth.uid()
    )
  );

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites
  for delete using (user_id = auth.uid() and public.is_active_user());

-- Storage への書き込みも利用中のときだけ
drop policy if exists "cyclex_images_insert_own" on storage.objects;
create policy "cyclex_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id in ('listing-images','avatars')
    and auth.uid() is not null
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cyclex_images_update_own" on storage.objects;
create policy "cyclex_images_update_own"
  on storage.objects for update
  using (
    bucket_id in ('listing-images','avatars')
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cyclex_images_delete_own" on storage.objects;
create policy "cyclex_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id in ('listing-images','avatars')
    and public.is_active_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 停止中のユーザーが既にいれば、JWT 側の app_metadata にも状態を載せておく
-- (proxy が DB を引かずに全パスで停止画面へ送るための印)
update auth.users a
   set raw_app_meta_data = coalesce(a.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('status', u.status)
  from public.users u
 where u.id = a.id and u.status in ('suspended', 'withdrawn');
