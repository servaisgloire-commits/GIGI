-- FAST ERP — volume artificiel pour test d'export/performance
-- PRÉREQUIS : erp-fast/sql/test_data.sql doit déjà avoir été exécuté.
-- À exécuter uniquement pendant l'étape 3 de validation, jamais comme donnée métier.
-- Crée 5 000 courses terminées TEST_ supplémentaires (indices 1001..6000).

begin;
set local timezone = 'Africa/Brazzaville';

with base as (
  select
    g,
    ((date '2026-06-01' + ((g-1001) % 120)) +
      case when g % 9=0 then time '23:15'
           when g % 13=0 then time '02:10'
           else time '13:30' end) at time zone 'Africa/Brazzaville' as requested_at,
    ((g-1001) % 10)+1 as driver_n,
    ((g-1001) % 3)+1 as client_n
  from generate_series(1001,6000) g
), prepared as (
  select
    g,requested_at,driver_n,client_n,
    extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
      'TEST_RIDE_'||lpad(g::text,3,'0')) as ride_id,
    extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
      'TEST_DRIVER_'||lpad(driver_n::text,2,'0')) as driver_id,
    extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
      'TEST_CLIENT_'||lpad(client_n::text,2,'0')) as client_id,
    extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
      'TEST_VEHICLE_'||lpad(driver_n::text,2,'0')) as vehicle_id,
    (1800 + ((g-1001) % 40)*75)::numeric as price
  from base
)
insert into public.rides(
  id,client_id,driver_id,vehicle_id,status,
  pickup_address,pickup_lat,pickup_lng,destination_address,destination_lat,destination_lng,
  estimated_distance_km,estimated_duration_min,estimated_price,final_price,currency,
  requested_at,accepted_at,started_at,completed_at,created_at,updated_at,
  requested_vehicle_type,driver_eta_min,dispatch_attempts,surge_multiplier,
  pickup_confirmed,destination_confirmed,pickup_country_code,pickup_country_name,
  destination_country_code,destination_country_name,payment_method,pricing_mode,
  agreed_price,standard_price,payment_state,payment_timing,payment_due_amount,
  payment_confirmed_at,cash_received_at
)
select
  ride_id,client_id,driver_id,vehicle_id,'completed'::public.ride_status,
  'TEST_VOLUME_PICKUP_'||g||'_Brazzaville',
  -4.2634 + ((g%100)::double precision/100000),15.2429 + ((g%100)::double precision/100000),
  'TEST_VOLUME_DESTINATION_'||g||'_Brazzaville',
  -4.2750 + ((g%100)::double precision/100000),15.2850 + ((g%100)::double precision/100000),
  round((2.5 + (g%15)*0.4)::numeric,2),12+(g%30),price,price,'XAF',
  requested_at,requested_at+interval '4 minutes',requested_at+interval '8 minutes',
  requested_at+interval '42 minutes',requested_at,requested_at+interval '42 minutes',
  'standard',4+(g%8),1,1,true,true,'CG','République du Congo','CG','République du Congo',
  'cash','standard',price,price,'cash_received','on_arrival',price,
  requested_at+interval '42 minutes',requested_at+interval '42 minutes'
from prepared
on conflict(id) do nothing;

commit;

-- Comptage attendu : 5 000 lignes TEST_VOLUME_* supplémentaires.
-- La purge standard couvre les IDs TEST_RIDE_0001..10000 et supprimera ce volume.
