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

-- -------------------------------------------------------------
-- A-8: 退会後に同じメールアドレスで再登録できるようにする(FR-01-5)
--
-- 退会は論理削除(auth.users の行は残す)。ただし行が残ると Auth 側で
-- メールアドレスと Google の identity が占有されたままになり、再登録は
-- 「確認メールが届かない」状態で止まっていた。
-- メールを到達不能なアドレスへ付け替え、identity を外して占有を解く。
-- public.users.email は on_auth_user_updated トリガーで同期される。
-- -------------------------------------------------------------
create or replace function public.release_withdrawn_account(target uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  update auth.users
     set email = 'withdrawn+' || target::text || '@withdrawn.invalid',
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"status":"withdrawn"}'::jsonb,
         updated_at = now()
   where id = target;

  delete from auth.identities where user_id = target;
end $$;

revoke all on function public.release_withdrawn_account(uuid) from public, anon, authenticated;
grant execute on function public.release_withdrawn_account(uuid) to service_role;

-- 同期トリガーは email / email_confirmed_at が変わったときだけ発火させる。
-- 従来は auth.users の全 UPDATE(サインインごとの last_sign_in_at 更新を含む)で
-- public.users を書き換え、updated_at が意味を失っていた。
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row
  when (old.email is distinct from new.email
        or old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.handle_user_email_verified();

-- -------------------------------------------------------------
-- A-9: 本人が PostgREST から直接更新できる列に、アプリと同じ検証を DB でも掛ける
--
-- display_name / bio / prefecture / avatar_url / notification_prefs は
-- authenticated に UPDATE 権限がある。アプリを経由しない書き込みで
-- 空の表示名・巨大な自己紹介・外部 URL のアイコン(next/image が例外を投げ、
-- その出品者のページが全員に対して落ちる)を保存できていた。
-- -------------------------------------------------------------
update public.users set display_name = 'ユーザー' where display_name = '';

alter table public.users
  add constraint users_display_name_len
    check (char_length(display_name) between 1 and 30);

alter table public.users
  add constraint users_bio_len
    check (bio is null or char_length(bio) <= 1000);

alter table public.users drop constraint if exists users_prefecture_check;
alter table public.users
  add constraint users_prefecture_check
    check (prefecture is null or prefecture ~ '^(0[1-9]|[1-3][0-9]|4[0-7])$');

-- アイコンは自分のフォルダ配下の Storage パスか、Google ログインのプロフィール画像のみ
alter table public.users
  add constraint users_avatar_url_fmt
    check (
      avatar_url is null
      or avatar_url ~ ('^' || id::text || '/[^/]+$')
      or avatar_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/'
    );

alter table public.users
  add constraint users_notification_prefs_shape
    check (jsonb_typeof(notification_prefs) = 'object' and pg_column_size(notification_prefs) < 2048);

-- -------------------------------------------------------------
-- B-4: 管理者による評価の非表示化を監査ログの対象に加える
-- -------------------------------------------------------------
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_target_type_check;
alter table public.admin_audit_logs
  add constraint admin_audit_logs_target_type_check
    check (target_type in ('user', 'listing', 'transaction', 'brand', 'report', 'review'));

-- -------------------------------------------------------------
-- B-7: スレッド一覧の集計を SQL 側で行う
--
-- 旧実装は参加スレッドの全メッセージを取得してアプリ側で最終メッセージと
-- 未読数を数えていた。PostgREST の max_rows(1,000 行)を超えると古いスレッドの
-- 本文・未読が黙って欠落する。service role からのみ呼ぶ関数に置き換える。
-- -------------------------------------------------------------
create or replace function public.thread_summaries(p_user uuid)
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
   where t.buyer_id = p_user or l.seller_id = p_user;
$$;

create or replace function public.unread_message_count(p_user uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
    from public.messages x
    join public.threads t on t.id = x.thread_id
    join public.listings l on l.id = t.listing_id
   where (t.buyer_id = p_user or l.seller_id = p_user)
     and x.sender_id <> p_user
     and x.read_at is null;
$$;

revoke all on function public.thread_summaries(uuid) from public, anon, authenticated;
revoke all on function public.unread_message_count(uuid) from public, anon, authenticated;
grant execute on function public.thread_summaries(uuid) to service_role;
grant execute on function public.unread_message_count(uuid) to service_role;

-- レート制限が数える列に索引を張る(旧: 全件走査)
create index if not exists idx_messages_sender_created on public.messages (sender_id, created_at);
create index if not exists idx_reports_reporter_created on public.reports (reporter_id, created_at);

-- -------------------------------------------------------------
-- C-3: 返金・チャージバックの追跡列。
--      返金 API は対象外(別紙1 3.(4))だが、Stripe で返金した事実を受け取って
--      「要返金」を消せないと、管理画面の警告が永久に残る
-- -------------------------------------------------------------
alter table public.transactions
  add column if not exists refunded_at timestamptz,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_id text;

create index if not exists idx_transactions_refund_pending
  on public.transactions (canceled_at)
  where status = 'canceled' and paid_at is not null and refunded_at is null;

-- C-6: ブランド名は大文字小文字を区別せず一意にする(Trek / trek の併存を防ぐ)
create unique index if not exists uq_brands_name_ci on public.brands (lower(name));

-- C-2: ホームのカテゴリ件数を 1 回で数える(旧: カテゴリ数ぶんの count クエリ)
create or replace function public.listing_category_counts()
returns table (category text, count bigint)
language sql stable security definer set search_path = public as $$
  select category, count(*)
    from public.listings
   where status in ('published', 'trading')
   group by category;
$$;
revoke all on function public.listing_category_counts() from public, anon, authenticated;
grant execute on function public.listing_category_counts() to service_role;

-- C-2: 管理画面の利用者一覧の件数を 1 回で数える(旧: 行ごとに 2 クエリ)
create or replace function public.admin_user_counts(ids uuid[])
returns table (user_id uuid, listing_count bigint, transaction_count bigint)
language sql stable security definer set search_path = public as $$
  select u.id,
         (select count(*) from public.listings l where l.seller_id = u.id),
         (select count(*) from public.transactions t where t.buyer_id = u.id or t.seller_id = u.id)
    from unnest(ids) as u(id);
$$;
revoke all on function public.admin_user_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_user_counts(uuid[]) to service_role;
