-- =============================================================
-- 運営が非表示にした商品の画像を、公開 URL から辿れないようにする
-- (docs/review/COMPLETION_PLAN.md C-4)
--
-- 商品を非表示にしても、画像は公開バケットに残るため URL を知っていれば見られた。
-- 非表示のあいだは専用の非公開バケットへ退避し、出品者・管理者には
-- 署名付き URL で見せる。解除時に元のバケットへ戻す。
--
-- このバケットには storage.objects のポリシーを作らない。
-- ポリシーが無い = anon / authenticated からは読み書きできず、
-- service_role(サーバー側の処理)だけが扱える。
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images-hidden',
  'listing-images-hidden',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
