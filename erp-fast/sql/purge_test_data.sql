-- FAST ERP — purge des fixtures TEST_
-- Supprime uniquement les UUID déterministes du namespace ERP FAST et les métadonnées TEST_ associées.
-- À exécuter avant toute bascule production finale si le jeu de données a été injecté.

begin;
set local timezone = 'Africa/Brazzaville';

-- Courses et dépendances.
with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.ratings where ride_id in (select id from test_rides);

with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.gps_events where ride_id in (select id from test_rides);

with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.eta_observations where ride_id in (select id from test_rides);

with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.dispatch_offers where ride_id in (select id from test_rides);

with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.payments where ride_id in (select id from test_rides);

with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.ride_events where ride_id in (select id from test_rides);

with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.ride_security where ride_id in (select id from test_rides);

with test_rides as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) id
  from generate_series(1,10000) g
)
delete from public.rides where id in (select id from test_rides);

-- Documents, véhicules et données chauffeurs.
with test_drivers as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id
  from generate_series(1,10) g
)
delete from public.driver_documents where driver_id in (select id from test_drivers);

with test_drivers as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id
  from generate_series(1,10) g
)
delete from public.driver_locations where driver_id in (select id from test_drivers);

with test_drivers as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id
  from generate_series(1,10) g
)
delete from public.driver_payout_profiles where driver_id in (select id from test_drivers);

with test_drivers as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id
  from generate_series(1,10) g
)
delete from public.vehicles where driver_id in (select id from test_drivers);

-- Règles de commission de fixture uniquement.
delete from public.commission_rules
where id in (
  extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,'TEST_COMMISSION_OLD'),
  extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,'TEST_COMMISSION_NEW')
);

-- Tous les comptes fixtures.
with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.account_admin_controls where user_id in (select id from test_users);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.saved_places where user_id in (select id from test_users);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.device_tokens where user_id in (select id from test_users);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.payment_methods where user_id in (select id from test_users);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.client_billing_profiles where user_id in (select id from test_users);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.notifications where user_id in (select id from test_users);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.wallets where user_id in (select id from test_users);

with test_drivers as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id
  from generate_series(1,10) g
)
delete from public.drivers where user_id in (select id from test_drivers);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from public.profiles where id in (select id from test_users);

-- Les identités sont également ON DELETE CASCADE depuis auth.users ; suppression explicite pour lisibilité.
with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from auth.identities where user_id in (select id from test_users);

with test_users as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_DRIVER_'||lpad(g::text,2,'0')) id from generate_series(1,10) g
  union all
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_CLIENT_'||lpad(g::text,2,'0')) id from generate_series(1,3) g
)
delete from auth.users where id in (select id from test_users);

-- Clés de paramètres TEST_ si une validation ultérieure en ajoute.
delete from public.app_settings where key like 'TEST\_%' escape '\';

commit;

-- Vérification recommandée après purge :
-- select count(*) from public.profiles where first_name like 'TEST_%'; -- attendu 0
-- select count(*) from public.rides where pickup_address like 'TEST_%'; -- attendu 0
-- select count(*) from public.driver_documents where file_name like 'TEST_%'; -- attendu 0
