-- =============================================================
-- CycleX 初期データ
-- `supabase db reset` 実行時に自動適用される
-- =============================================================

insert into public.brands (name) values
  ('Trek'),
  ('Specialized'),
  ('Giant'),
  ('Cannondale'),
  ('Bianchi'),
  ('Pinarello'),
  ('Colnago'),
  ('Cervélo'),
  ('Scott'),
  ('Merida'),
  ('BMC'),
  ('Canyon'),
  ('GIOS'),
  ('RALEIGH'),
  ('Brompton'),
  ('DAHON'),
  ('tern'),
  ('FUJI'),
  ('ANCHOR'),
  ('KhodaaBloom'),
  ('NESTO'),
  ('LOUIS GARNEAU'),
  ('Panasonic'),
  ('YAMAHA'),
  ('BRIDGESTONE'),
  ('Shimano'),
  ('SRAM'),
  ('Campagnolo'),
  ('MAVIC'),
  ('FULCRUM')
on conflict (name) do nothing;

-- -------------------------------------------------------------
-- 最初の管理者アカウントの作成手順(手動)
--
-- 1. アプリから通常の会員登録を行う
-- 2. 以下を実行してロールを昇格する
--
--    update public.users set role = 'admin' where email = 'admin@example.com';
--
-- 2 人目以降は管理画面の会員詳細から付与・剥奪できる(issue #18)。
-- SQL が要るのは最初の 1 人だけ。
-- -------------------------------------------------------------
