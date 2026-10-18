-- New FAST accounts start pending; automated preflight validates clients only after verified email and completed profile.
CREATE OR REPLACE FUNCTION public.handle_new_fast_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare requested_role public.fast_user_role; requested_country text; wallet_currency text;
begin
  requested_role := case when coalesce(new.raw_user_meta_data->>'role','client')='driver' then 'driver'::public.fast_user_role else 'client'::public.fast_user_role end;
  requested_country := upper(coalesce(nullif(new.raw_user_meta_data->>'country_code',''),'CG'));
  if requested_country !~ '^[A-Z]{2}$' then requested_country:='CG'; end if;
  select currency into wallet_currency from public.market_configs where country_code=requested_country and enabled=true limit 1;
  wallet_currency := coalesce(wallet_currency,'XAF');
  insert into public.profiles(id,role,first_name,last_name,phone,email,country_code)
  values(new.id,requested_role,nullif(new.raw_user_meta_data->>'first_name',''),nullif(new.raw_user_meta_data->>'last_name',''),nullif(coalesce(new.phone,new.raw_user_meta_data->>'phone'),''),lower(nullif(new.email,'')),requested_country);
  insert into public.wallets(user_id,balance,currency) values(new.id,0,wallet_currency);
  insert into public.account_admin_controls(user_id,account_role,admin_status,is_active)
  values(new.id,requested_role::text,'pending',true);
  if requested_role='driver' then insert into public.drivers(user_id,status,is_verified) values(new.id,'offline',false); end if;
  insert into public.notifications(user_id,title,body,data) values(new.id,'Bienvenue sur FAST',case when requested_role='driver' then 'Votre compte chauffeur est créé. Complétez votre véhicule puis attendez la validation.' else 'Confirmez votre adresse e-mail et complétez votre profil pour activer les réservations.' end,jsonb_build_object('type','account_created','role',requested_role::text));
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.handle_fast_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  requested_role public.fast_user_role;
begin
  begin
    requested_role := case when new.raw_user_meta_data->>'role'='driver' then 'driver'::public.fast_user_role else 'client'::public.fast_user_role end;
  exception when others then
    requested_role := 'client'::public.fast_user_role;
  end;

  insert into public.profiles(id,role,first_name,last_name,phone)
  values(
    new.id,
    requested_role,
    nullif(new.raw_user_meta_data->>'first_name',''),
    nullif(new.raw_user_meta_data->>'last_name',''),
    nullif(coalesce(new.phone,new.raw_user_meta_data->>'phone'),'')
  ) on conflict (id) do nothing;

  insert into public.wallets(user_id,balance,currency)
  values(new.id,0,'XAF') on conflict (user_id) do nothing;

  if requested_role='driver'::public.fast_user_role then
    insert into public.drivers(user_id,status,is_verified,rating,total_rides)
    values(new.id,'offline',false,5.0,0) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$function$;
