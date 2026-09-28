-- =============================================================
-- メーカーマスタの追加(クロスバイク)
--
-- クロスバイクの主要メーカー一覧を突き合わせ、
-- 20260101000012_brand_master.sql に無かった分だけを足す。
-- 残り25件は既に入っているため、ここには出てこない。
--
-- 何度流しても同じ結果になるようにしてある
-- (カナは空のときだけ補い、管理画面で直した値を上書きしない)。
-- =============================================================

insert into public.brands (name, name_kana) values
  ('CENTURION', 'センチュリオン'),
  ('MOMENTUM', 'モメンタム'),
  ('PEUGEOT', 'プジョー')
on conflict (name) do update
  set name_kana = excluded.name_kana
  where brands.name_kana is null;
