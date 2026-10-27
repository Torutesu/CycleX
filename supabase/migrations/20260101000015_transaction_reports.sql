-- =============================================================
-- 取引の問題を運営へ申告できるようにする(利用規約 第11条2・第14条)
--
-- 規約では「商品が届かない・説明と違う・破損や欠品がある」といった問題を
-- 運営が定める方法で申告することになっている。既存の通報(商品・利用者)に
-- 取引を対象として足し、取引画面から当事者が申告できるようにする。
--
-- 理由は取引向けのものを足す。値は src/lib/constants.ts の
-- REPORT_REASONS / TRANSACTION_REPORT_REASONS と揃える。
-- 制約名は schema.sql の列制約に Postgres が付けた既定の名前。
-- =============================================================

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('listing', 'user', 'transaction'));

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports
  add constraint reports_reason_check
  check (reason in (
    -- 商品・利用者
    'prohibited', 'fraud', 'inappropriate', 'tos_violation',
    -- 取引
    'not_received', 'not_as_described', 'damaged', 'no_response',
    -- 共通
    'other'
  ));

-- 書き込みは Server Action(service role)からのみ。anon/authenticated には
-- reports への insert 権限が無い(20260101000004_harden_grants.sql)。
-- 取引の申告が当事者に限られることは Server Action 側で確かめている。
