-- =============================================================
-- Phase A: 本番運用に向けた堅牢化(docs/review/COMPLETION_PLAN.md §1)
-- =============================================================

-- A-3: メール送信ログに「未設定のためスキップ」を sent と区別して記録する
alter table public.email_logs drop constraint if exists email_logs_status_check;
alter table public.email_logs
  add constraint email_logs_status_check check (status in ('sent','failed','skipped'));
