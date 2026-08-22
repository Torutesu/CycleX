-- =============================================================
-- Storage バケットとポリシー
-- パス規約:
--   listing-images/{userId}/{uuid}.{ext}
--   avatars/{userId}/{uuid}.{ext}
-- 先頭フォルダを所有者 ID とし、書き込みは本人のみに限定する。
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-images', 'listing-images', true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('avatars',        'avatars',        true, 5242880,  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "cyclex_images_read"
  on storage.objects for select
  using (bucket_id in ('listing-images','avatars'));

create policy "cyclex_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id in ('listing-images','avatars')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cyclex_images_update_own"
  on storage.objects for update
  using (
    bucket_id in ('listing-images','avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cyclex_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id in ('listing-images','avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
