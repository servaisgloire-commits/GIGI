create or replace function public.get_fast_google_maps_android_key()
returns text
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'fast_google_maps_android_api_key'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_fast_google_maps_android_key() from public;
revoke all on function public.get_fast_google_maps_android_key() from anon;
revoke all on function public.get_fast_google_maps_android_key() from authenticated;
grant execute on function public.get_fast_google_maps_android_key() to service_role;
