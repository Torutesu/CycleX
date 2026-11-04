-- =============================================================
-- 発送前のキャンセル(双方合意)を、取引画面から運営へ申告できるようにする
--
-- 取引ルール(甲の指定): 購入者都合のキャンセルは原則不可。ただし発送前で、
-- 出品者と購入者の双方が合意している場合に限りキャンセルできる。
-- キャンセルと返金は運営が行うため、当事者は合意したことを申告で知らせる。
-- (発送前に限ることは Server Action 側で確かめている)
--
-- 値は src/lib/constants.ts の REPORT_REASONS / TRANSACTION_REPORT_REASONS と揃える。
-- =============================================================

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports
  add constraint reports_reason_check
  check (reason in (
    -- 商品・利用者
    'prohibited', 'fraud', 'inappropriate', 'tos_violation',
    -- 取引
    'cancel_agreed', 'not_received', 'not_as_described', 'damaged', 'no_response',
    -- 共通
    'other'
  ));
