-- =============================================================
-- 出品価格の下限を 3,000 円にする(甲の指定)
--
-- 画面とサーバーの検証は src/lib/constants.ts の PRICE_MIN で止めている。
-- ここは最後の砦で、アプリのどこかに検証の抜けがあっても、
-- 3,000 円未満の商品が公開されないようにする。
-- (実際、取下げからの再公開は価格を見ずに公開へ戻していた)
--
-- 行ごとの check 制約にしない理由:
--   - 下書きは「タイトルだけ必須」で、価格は公開時に確かめる作り。
--     下書きの途中の値まで弾くと、保存そのものができなくなる
--   - 下限ができる前に公開された商品が、購入されて取引中・売却済みへ
--     進むときの更新まで弾いてしまう
--
-- そこで「公開に入るとき」と「公開中に価格を変えるとき」だけ止める。
--   - 新しく公開する(下書き・取下げからの公開、公開状態での新規作成)
--   - 公開中の商品の価格を変える
-- 運営による利用停止の解除(suspended → published)は、
-- 公開されていた商品を元に戻す操作なので対象にしない。
--
-- 3000 は PRICE_MIN と同じ値。片方を変えたら、もう片方も変えること。
-- =============================================================

create or replace function public.enforce_listing_price_min()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'published'
     and (new.price is null or new.price < 3000)
     and (
       tg_op = 'INSERT'
       or old.status in ('draft', 'withdrawn')
       or (old.status = 'published' and new.price is distinct from old.price)
     )
  then
    raise exception '希望価格は3,000円以上にしてください'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

comment on function public.enforce_listing_price_min() is
  '出品価格の下限(3,000円)。公開に入るときと、公開中に価格を変えるときだけ確かめる。';

drop trigger if exists trg_listing_price_min on public.listings;
create trigger trg_listing_price_min
  before insert or update of status, price on public.listings
  for each row execute function public.enforce_listing_price_min();
