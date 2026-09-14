create or replace function public.fast_lock_client_cancellation_after_accept()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status in ('in_progress', 'completed')
     and new.status = 'cancelled'
     and coalesce(new.cancellation_reason, '') = 'client_cancelled' then
    raise exception 'client_cancellation_locked_after_start' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
