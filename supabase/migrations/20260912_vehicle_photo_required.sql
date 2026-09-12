-- FAST N°1 — photo et immatriculation obligatoires pour tout véhicule actif.
-- La photo reste privée dans Supabase Storage. Le backend génère une URL signée
-- uniquement lorsqu'un client autorisé consulte la course qui lui a été attribuée.

alter table public.vehicles
  add column if not exists photo_path text null;

alter table public.vehicles
  drop constraint if exists vehicles_active_requires_plate_photo;

alter table public.vehicles
  add constraint vehicles_active_requires_plate_photo check (
    not is_active
    or (
      nullif(btrim(plate_number), '') is not null
      and nullif(btrim(photo_path), '') is not null
    )
  );

create unique index if not exists vehicles_plate_number_unique_idx
  on public.vehicles (lower(regexp_replace(plate_number, '\s+', '', 'g')))
  where plate_number is not null and btrim(plate_number) <> '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vehicle_photos_storage_select_own on storage.objects;
drop policy if exists vehicle_photos_storage_insert_own on storage.objects;
drop policy if exists vehicle_photos_storage_update_own on storage.objects;
drop policy if exists vehicle_photos_storage_delete_own on storage.objects;

create policy vehicle_photos_storage_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy vehicle_photos_storage_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy vehicle_photos_storage_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy vehicle_photos_storage_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

comment on column public.vehicles.photo_path is
  'Chemin privé Supabase Storage de la photo du véhicule utilisée pour la proposition client.';
