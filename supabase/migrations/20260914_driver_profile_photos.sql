insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-photos',
  'driver-photos',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='driver_photos_storage_insert_own'
  ) then
    create policy driver_photos_storage_insert_own on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'driver-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='driver_photos_storage_select_own'
  ) then
    create policy driver_photos_storage_select_own on storage.objects
      for select to authenticated
      using (
        bucket_id = 'driver-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='driver_photos_storage_update_own'
  ) then
    create policy driver_photos_storage_update_own on storage.objects
      for update to authenticated
      using (
        bucket_id = 'driver-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'driver-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='driver_photos_storage_delete_own'
  ) then
    create policy driver_photos_storage_delete_own on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'driver-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;
end
$$;
