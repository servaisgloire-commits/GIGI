create or replace function public.fast_require_verified_pin_before_start()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status::text = 'in_progress'
     and old.status::text is distinct from 'in_progress' then
    if not exists (
      select 1
      from public.ride_security s
      where s.ride_id = new.id
        and s.pin_verified_at is not null
    ) then
      raise exception 'ride_pin_not_verified' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists require_verified_pin_before_start on public.rides;
create trigger require_verified_pin_before_start
before update of status on public.rides
for each row
execute function public.fast_require_verified_pin_before_start();
