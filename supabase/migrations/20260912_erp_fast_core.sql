-- ERP FAST — structures de gestion validées le 12/09/2026
-- Supabase reste une couche de stockage : aucune logique métier de calcul n'est placée ici.

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  commission_type text not null check (commission_type in ('percentage','fixed')),
  value numeric(14,4) not null check (value >= 0),
  scope_type text not null check (scope_type in ('global','driver','vehicle_category')),
  driver_id uuid null references public.drivers(user_id) on delete cascade,
  vehicle_type text null,
  currency text not null default 'XAF',
  valid_from timestamptz not null default now(),
  valid_until timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint commission_rules_percentage_range check (commission_type <> 'percentage' or value <= 100),
  constraint commission_rules_period check (valid_until is null or valid_until > valid_from),
  constraint commission_rules_scope_check check (
    (scope_type = 'global' and driver_id is null and vehicle_type is null)
    or (scope_type = 'driver' and driver_id is not null and vehicle_type is null)
    or (scope_type = 'vehicle_category' and driver_id is null and vehicle_type is not null)
  )
);

create index if not exists commission_rules_validity_idx
  on public.commission_rules (is_active, valid_from desc, valid_until);
create index if not exists commission_rules_driver_idx
  on public.commission_rules (driver_id, valid_from desc)
  where driver_id is not null;
create index if not exists commission_rules_vehicle_type_idx
  on public.commission_rules (vehicle_type, valid_from desc)
  where vehicle_type is not null;

create table if not exists public.pricing_history (
  id uuid primary key default gen_random_uuid(),
  pricing_id uuid null references public.market_pricing(id) on delete set null,
  country_code text not null references public.market_configs(country_code) on delete restrict,
  service_type text not null,
  old_pricing jsonb not null default '{}'::jsonb,
  new_pricing jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pricing_history_market_service_idx
  on public.pricing_history (country_code, service_type, effective_at desc);
create index if not exists pricing_history_pricing_id_idx
  on public.pricing_history (pricing_id, effective_at desc);

alter table public.market_pricing
  add column if not exists night_multiplier numeric(8,4) not null default 1,
  add column if not exists weekend_multiplier numeric(8,4) not null default 1,
  add column if not exists holiday_multiplier numeric(8,4) not null default 1;

alter table public.market_pricing
  drop constraint if exists market_pricing_night_multiplier_check,
  drop constraint if exists market_pricing_weekend_multiplier_check,
  drop constraint if exists market_pricing_holiday_multiplier_check;

alter table public.market_pricing
  add constraint market_pricing_night_multiplier_check check (night_multiplier >= 0),
  add constraint market_pricing_weekend_multiplier_check check (weekend_multiplier >= 0),
  add constraint market_pricing_holiday_multiplier_check check (holiday_multiplier >= 0);

create table if not exists public.account_admin_controls (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_role text not null check (account_role in ('client','driver')),
  admin_status text not null default 'pending' check (admin_status in ('pending','validated','invalidated')),
  is_active boolean not null default true,
  internal_reason text null,
  validated_at timestamptz null,
  invalidated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_admin_controls_status_dates check (
    (admin_status = 'pending')
    or (admin_status = 'validated' and validated_at is not null)
    or (admin_status = 'invalidated' and invalidated_at is not null)
  )
);

create index if not exists account_admin_controls_status_idx
  on public.account_admin_controls (account_role, admin_status, is_active);

comment on table public.commission_rules is 'Règles de commission versionnées. Une règle existante ne doit jamais être modifiée par l''ERP : tout changement crée une nouvelle ligne.';
comment on table public.pricing_history is 'Historique immuable des modifications de market_pricing.';
comment on table public.account_admin_controls is 'État administratif des comptes, distinct du statut opérationnel drivers.status.';
comment on column public.market_pricing.night_multiplier is 'Multiplicateur tarifaire de nuit, 1 = aucune majoration.';
comment on column public.market_pricing.weekend_multiplier is 'Multiplicateur tarifaire week-end, 1 = aucune majoration.';
comment on column public.market_pricing.holiday_multiplier is 'Multiplicateur tarifaire jour férié, 1 = aucune majoration.';
