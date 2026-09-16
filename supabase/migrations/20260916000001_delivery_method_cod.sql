-- 受渡方法に「配送(着払い)」を追加する
--
-- 従来は 'shipping'(送料込み)と 'in_person'(対面)の 2 択だった。
-- 自転車は大きさ・重さの幅が広く、送料を出品時に見積もれない場合がある。
-- 着払いを選べるようにして、送料の負担者を出品者と購入者で切り替えられるようにする。
--
-- 'shipping_cod' は配送の一種なので、発送連絡・受取確認の流れは
-- 'shipping' と同じ。違うのは送料が CycleX の決済を通らない点だけで、
-- 金額を表示する画面ではその旨を注記する(src/lib/constants.ts priceNote)。
--
-- 既存行は影響を受けない(制約を緩める方向の変更)。

-- 元の制約は列定義に直接書かれていたため、名前は Postgres の自動命名に依存する。
-- 名前を決め打ちにすると環境によって落ちるので、delivery_method を参照している
-- 検査制約を探して落とす。
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'listings'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%delivery_method%'
  loop
    execute format('alter table public.listings drop constraint %I', v_name);
  end loop;
end $$;

alter table public.listings
  add constraint listings_delivery_method_check
  check (delivery_method in ('shipping', 'shipping_cod', 'in_person'));
