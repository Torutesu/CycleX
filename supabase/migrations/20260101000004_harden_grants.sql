-- =============================================================
-- テーブル権限の絞り込み(コードレビュー S1-0 / S1-1 の修正)
--
-- 背景:
--   20260101000002_rls.sql では anon / authenticated に対してテーブル単位で
--   SELECT・UPDATE を付与していた。RLS ポリシーは「どの行か」しか制御できず
--   「どの列か」は制御できないため、以下が可能になっていた。
--
--   1. 権限昇格: ログインユーザーが自分の行の role を 'admin' に更新できる。
--      status を 'active' に戻して利用停止を自力解除することもできた。
--   2. 個人情報の流出: anon key(ブラウザに配布される公開値)で
--      GET /rest/v1/users?select=email から全会員のメールアドレスを取得できた。
--
-- 方針:
--   - users は列単位の GRANT に置き換える。非公開列(email / role /
--     email_verified_at / notification_prefs / suspended_reason / withdrawn_at)は
--     anon・authenticated に一切見せない。
--   - 業務ロジックを伴う書き込み(出品・通報・スレッド・ブランド)は
--     すべて Server Action が service role で行っているため、
--     authenticated からの直接書き込み権限を剥奪する。
--   - favorites だけは Server Action が anon クライアントで書いているため権限を残し、
--     代わりに RLS 側で「公開中の他人の商品」に限定する。
-- =============================================================

-- -------------------------------------------------------------
-- users: 列単位の権限へ置き換える
-- -------------------------------------------------------------
revoke select, update on public.users from anon, authenticated;

-- 公開プロフィールとして表示してよい列のみ読ませる。
-- email / role / email_verified_at / notification_prefs / suspended_reason /
-- withdrawn_at / updated_at は含めない。
grant select (id, display_name, avatar_url, bio, prefecture, status, created_at)
  on public.users to anon, authenticated;

-- 本人が自分で変更してよい列のみ書かせる(行の限定は users_update_self が担う)。
grant update (display_name, avatar_url, bio, prefecture, notification_prefs)
  on public.users to authenticated;

-- -------------------------------------------------------------
-- 書き込みはすべて Server Action(service role)経由に統一する
--
-- ポリシー自体は多層防御として残すが、権限を落とすことで
-- PostgREST を直接叩く経路を塞ぐ。
-- -------------------------------------------------------------
revoke insert, update, delete on public.listings from authenticated;
revoke insert, update, delete on public.listing_images from authenticated;
revoke insert on public.threads from authenticated;
revoke insert, update on public.reports from authenticated;
revoke insert, update, delete on public.brands from authenticated;

-- -------------------------------------------------------------
-- favorites: 対象商品の条件を RLS で担保する
--
-- 旧ポリシーは user_id しか見ていなかったため、下書きや運営非表示の商品にも
-- お気に入りを付けられ、トリガー経由で favorites_count を動かせた。
-- -------------------------------------------------------------
drop policy if exists favorites_all_own on public.favorites;

create policy favorites_select_own on public.favorites
  for select using (user_id = auth.uid());

create policy favorites_insert_own on public.favorites
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.listings l
       where l.id = listing_id
         and l.status in ('published', 'trading', 'sold')
         and l.seller_id <> auth.uid()
    )
  );

create policy favorites_delete_own on public.favorites
  for delete using (user_id = auth.uid());

-- -------------------------------------------------------------
-- listings.suspended_reason(運営の非表示理由)も本来は非公開列だが、
-- アプリ側に `select("*")` を使う画面が残っているため、ここでは扱わない。
-- 列単位に絞る場合は先に該当箇所を明示列指定へ直すこと。
--   - src/app/(member)/mypage/listings/page.tsx
--   - src/app/(member)/sell/[id]/edit/page.tsx
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- 以降に追加されるテーブルの既定権限は 20260101000002 のままでよい
-- (service_role = all / anon・authenticated = select)。
-- 新しいテーブルに非公開列を持たせる場合は、このファイルと同様に
-- 列単位の GRANT を明示すること。
-- =============================================================
