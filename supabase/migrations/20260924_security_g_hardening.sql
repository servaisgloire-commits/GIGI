-- SECURITY G hardening: privilege escalation guard, PIN cryptography, and direct-access reduction.
-- This migration preserves the existing FAST API/RPC contracts.

begin;

-- 1) Prevent authenticated users from escalating their own profile role.
revoke all privileges on table public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (first_name, last_name, phone, avatar_url) on table public.profiles to authenticated;

create or replace function public.fast_protect_profile_security_fields()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog', 'public', 'auth'
as $$
begin
  if current_user = 'authenticated' then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'protected_profile_field';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.fast_protect_profile_security_fields() from public, anon, authenticated;

drop trigger if exists fast_profiles_protect_security_fields on public.profiles;
create trigger fast_profiles_protect_security_fields
before update on public.profiles
for each row execute function public.fast_protect_profile_security_fields();

-- 2) Direct mobile/API access is not required for these server-internal or sensitive tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'fast_signing_secrets',
    'fast_company_bank',
    'fast_admin_audit',
    'fast_admin_users',
    'auth_email_memory',
    'fast_agent_registry',
    'fast_agent_runs',
    'fast_agent_events',
    'fast_agent_tasks',
    'fast_agent_approvals',
    'fast_agent_memory',
    'fast_agent_change_proposals',
    'fast_security_findings',
    'fast_design_proposals',
    'payments',
    'wallet_transactions',
    'ride_events',
    'ride_security',
    'driver_payout_profiles'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all privileges on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

-- 3) Require the Vault PIN key and migrate active PIN hashes to keyed HMAC-SHA256.
do $$
declare
  v_key text;
  r record;
  v_pin text;
begin
  select decrypted_secret
    into v_key
  from vault.decrypted_secrets
  where name = 'fast_ride_pin_key'
  order by created_at desc
  limit 1;

  if coalesce(v_key, '') = '' then
    raise exception 'fast_ride_pin_key_missing';
  end if;

  for r in
    select ride_id, pin_ciphertext
    from public.ride_security
    where pin_verified_at is null
      and pin_ciphertext is not null
  loop
    v_pin := extensions.pgp_sym_decrypt(r.pin_ciphertext, v_key);
    if v_pin !~ '^\d{4}$' then
      raise exception 'invalid_existing_pin_for_ride_%', r.ride_id;
    end if;

    update public.ride_security
       set pin_hash = encode(
         extensions.hmac(
           convert_to(v_pin || r.ride_id::text, 'utf8'),
           convert_to(v_key, 'utf8'),
           'sha256'
         ),
         'hex'
       ),
       updated_at = now()
     where ride_id = r.ride_id;
  end loop;
end
$$;

create or replace function public.issue_ride_pin(p_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth', 'extensions', 'vault'
as $$
declare
  v_uid uuid := auth.uid();
  v_client uuid;
  v_status text;
  v_pin text;
  v_share uuid;
  v_key text;
  v_cipher bytea;
  v_verified timestamptz;
  v_rand bytea;
  v_number integer;
begin
  select client_id, status::text
    into v_client, v_status
  from public.rides
  where id = p_ride_id;

  if v_client is null then raise exception 'ride_not_found'; end if;
  if v_uid is null or v_uid <> v_client then raise exception 'forbidden'; end if;
  if v_status in ('completed', 'cancelled') then raise exception 'ride_not_active'; end if;

  select pin_ciphertext, pin_verified_at, share_token
    into v_cipher, v_verified, v_share
  from public.ride_security
  where ride_id = p_ride_id;

  if v_verified is not null then
    return jsonb_build_object('ride_id', p_ride_id, 'pin', null, 'share_token', v_share, 'verified', true);
  end if;

  select decrypted_secret
    into v_key
  from vault.decrypted_secrets
  where name = 'fast_ride_pin_key'
  order by created_at desc
  limit 1;

  if coalesce(v_key, '') = '' then
    raise exception 'pin_key_unavailable';
  end if;

  if v_cipher is not null then
    begin
      v_pin := extensions.pgp_sym_decrypt(v_cipher, v_key);
    exception when others then
      v_pin := null;
    end;
  end if;

  if v_pin is null or v_pin !~ '^\d{4}$' then
    loop
      v_rand := extensions.gen_random_bytes(2);
      v_number := get_byte(v_rand, 0) * 256 + get_byte(v_rand, 1);
      exit when v_number < 60000;
    end loop;
    v_pin := lpad((v_number % 10000)::text, 4, '0');

    insert into public.ride_security(
      ride_id, pin_hash, pin_ciphertext, pin_issued_at
    )
    values(
      p_ride_id,
      encode(
        extensions.hmac(
          convert_to(v_pin || p_ride_id::text, 'utf8'),
          convert_to(v_key, 'utf8'),
          'sha256'
        ),
        'hex'
      ),
      extensions.pgp_sym_encrypt(v_pin, v_key),
      now()
    )
    on conflict(ride_id) do update
      set pin_hash = excluded.pin_hash,
          pin_ciphertext = excluded.pin_ciphertext,
          pin_issued_at = excluded.pin_issued_at,
          pin_failed_attempts = 0,
          pin_locked_until = null,
          updated_at = now()
      where public.ride_security.pin_verified_at is null;

    select share_token
      into v_share
    from public.ride_security
    where ride_id = p_ride_id;
  end if;

  return jsonb_build_object(
    'ride_id', p_ride_id,
    'pin', v_pin,
    'share_token', v_share,
    'verified', false
  );
end
$$;

create or replace function public.verify_ride_pin(p_ride_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth', 'extensions', 'vault'
as $$
declare
  v_uid uuid := auth.uid();
  v_driver uuid;
  v_hash text;
  v_expected text;
  v_ok boolean;
  v_failed integer;
  v_locked timestamptz;
  v_key text;
begin
  select driver_id
    into v_driver
  from public.rides
  where id = p_ride_id;

  if v_driver is null then raise exception 'driver_not_assigned'; end if;
  if v_uid is null or v_uid <> v_driver then raise exception 'forbidden'; end if;

  select pin_hash, pin_failed_attempts, pin_locked_until
    into v_hash, v_failed, v_locked
  from public.ride_security
  where ride_id = p_ride_id
  for update;

  if v_hash is null then raise exception 'pin_not_issued'; end if;
  if v_locked is not null and v_locked > now() then raise exception 'pin_temporarily_locked'; end if;

  select decrypted_secret
    into v_key
  from vault.decrypted_secrets
  where name = 'fast_ride_pin_key'
  order by created_at desc
  limit 1;

  if coalesce(v_key, '') = '' then
    raise exception 'pin_key_unavailable';
  end if;

  v_expected := encode(
    extensions.hmac(
      convert_to(coalesce(p_pin, '') || p_ride_id::text, 'utf8'),
      convert_to(v_key, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  v_ok := v_hash = v_expected;

  if v_ok then
    update public.ride_security
       set pin_verified_at = now(),
           pin_failed_attempts = 0,
           pin_locked_until = null,
           pin_ciphertext = null,
           updated_at = now()
     where ride_id = p_ride_id;
  else
    v_failed := coalesce(v_failed, 0) + 1;
    update public.ride_security
       set pin_failed_attempts = v_failed,
           pin_locked_until = case when v_failed >= 5 then now() + interval '10 minutes' end,
           updated_at = now()
     where ride_id = p_ride_id;
  end if;

  return jsonb_build_object(
    'verified', v_ok,
    'remaining_attempts', greatest(0, 5 - coalesce(v_failed, 0))
  );
end
$$;

-- Keep the three mobile security RPCs callable only by signed-in users and service code.
revoke all on function public.issue_ride_pin(uuid) from public, anon;
revoke all on function public.verify_ride_pin(uuid, text) from public, anon;
revoke all on function public.get_ride_security_state(uuid) from public, anon;
grant execute on function public.issue_ride_pin(uuid) to authenticated, service_role;
grant execute on function public.verify_ride_pin(uuid, text) to authenticated, service_role;
grant execute on function public.get_ride_security_state(uuid) to authenticated, service_role;

commit;
