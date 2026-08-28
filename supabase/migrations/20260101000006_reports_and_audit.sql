-- =============================================================
-- 通報の重複制限の見直しと、管理操作の記録(S3-6 / S3-8)
-- =============================================================

-- -------------------------------------------------------------
-- 1. 通報: 同一対象への再通報を「未対応の間だけ」制限する
--
-- 旧制約 unique (reporter_id, target_type, target_id) は永久に効くため、
-- 一度通報した相手は運営の対応が終わったあとに再び問題を起こしても
-- 二度と通報できなかった。未対応(open)の通報が1件あるあいだだけ塞ぐ。
-- -------------------------------------------------------------
alter table public.reports
  drop constraint if exists reports_reporter_id_target_type_target_id_key;

create unique index uq_reports_open
  on public.reports (reporter_id, target_type, target_id)
  where status = 'open';

-- -------------------------------------------------------------
-- 2. 管理操作の記録
--
-- transaction_events は取引にしか残らないため、利用停止・非表示・ブランド変更
-- といった管理操作の履歴が残っていなかった。誰が何をしたかを追えるようにする。
-- -------------------------------------------------------------
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id),
  action text not null,
  target_type text not null check (target_type in ('user', 'listing', 'transaction', 'brand', 'report')),
  target_id uuid,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is
  '管理画面から行われた操作の記録。閲覧は管理者のみ。書き込みは Server Action(service role)から。';

create index idx_admin_audit_created on public.admin_audit_logs (created_at desc);
create index idx_admin_audit_target on public.admin_audit_logs (target_type, target_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

create policy admin_audit_admin_select on public.admin_audit_logs
  for select using (public.is_admin());

-- 20260101000002 の alter default privileges により、
-- service_role には all、anon/authenticated には select が自動で付与される。
-- 閲覧範囲は上記ポリシーが絞る。
