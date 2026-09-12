-- FAST ERP — jeu de données de validation contrôlé
-- IMPORTANT : ce script est préparé pour l'étape 2 du go-live.
-- Ne pas exécuter tant que l'étape 1 de VALIDATION.md n'est pas ✅.
-- Toutes les entités sont identifiables par TEST_ et/ou par des UUID v5 déterministes.
-- Aucun mot de passe de test en clair n'est versionné : PostgreSQL génère un secret aléatoire non récupéré.

begin;
set local timezone = 'Africa/Brazzaville';

-- Namespace stable dédié aux fixtures ERP FAST.
-- UUID utilisateur = uuid_generate_v5(namespace, code TEST_...).

-- 10 chauffeurs + 3 clients de test dans Supabase Auth.
with test_users(code, account_role, first_name, last_name, email, phone) as (
  values
    ('TEST_DRIVER_01','driver','TEST_Driver01','FAST','test_driver_01@fast.invalid','+242060000001'),
    ('TEST_DRIVER_02','driver','TEST_Driver02','FAST','test_driver_02@fast.invalid','+242060000002'),
    ('TEST_DRIVER_03','driver','TEST_Driver03','FAST','test_driver_03@fast.invalid','+242060000003'),
    ('TEST_DRIVER_04','driver','TEST_Driver04','FAST','test_driver_04@fast.invalid','+242060000004'),
    ('TEST_DRIVER_05','driver','TEST_Driver05','FAST','test_driver_05@fast.invalid','+242060000005'),
    ('TEST_DRIVER_06','driver','TEST_Driver06','FAST','test_driver_06@fast.invalid','+242060000006'),
    ('TEST_DRIVER_07','driver','TEST_Driver07','FAST','test_driver_07@fast.invalid','+242060000007'),
    ('TEST_DRIVER_08','driver','TEST_Driver08','FAST','test_driver_08@fast.invalid','+242060000008'),
    ('TEST_DRIVER_09','driver','TEST_Driver09','FAST','test_driver_09@fast.invalid','+242060000009'),
    ('TEST_DRIVER_10','driver','TEST_Driver10','FAST','test_driver_10@fast.invalid','+242060000010'),
    ('TEST_CLIENT_01','client','TEST_Client01','FAST','test_client_01@fast.invalid','+242065000001'),
    ('TEST_CLIENT_02','client','TEST_Client02','FAST','test_client_02@fast.invalid','+242065000002'),
    ('TEST_CLIENT_03','client','TEST_Client03','FAST','test_client_03@fast.invalid','+242065000003')
), prepared as (
  select
    extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid, code) as id,
    code, account_role, first_name, last_name, lower(email) as email, phone
  from test_users
)
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  id,
  'authenticated',
  'authenticated',
  email,
  extensions.crypt(encode(extensions.gen_random_bytes(24),'hex'), extensions.gen_salt('bf')),
  now(),
  jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
  jsonb_build_object(
    'sub',id::text,
    'role',account_role,
    'email',email,
    'phone',phone,
    'first_name',first_name,
    'last_name',last_name,
    'country_code','CG',
    'email_verified',true,
    'phone_verified',false,
    'test_fixture','TEST_ERP_FAST'
  ),
  now(),now(),false,false
from prepared
on conflict (id) do update set
  raw_user_meta_data=excluded.raw_user_meta_data,
  raw_app_meta_data=excluded.raw_app_meta_data,
  updated_at=now();

-- Identités email nécessaires à la cohérence Auth.
with test_users(code, account_role, first_name, last_name, email, phone) as (
  values
    ('TEST_DRIVER_01','driver','TEST_Driver01','FAST','test_driver_01@fast.invalid','+242060000001'),
    ('TEST_DRIVER_02','driver','TEST_Driver02','FAST','test_driver_02@fast.invalid','+242060000002'),
    ('TEST_DRIVER_03','driver','TEST_Driver03','FAST','test_driver_03@fast.invalid','+242060000003'),
    ('TEST_DRIVER_04','driver','TEST_Driver04','FAST','test_driver_04@fast.invalid','+242060000004'),
    ('TEST_DRIVER_05','driver','TEST_Driver05','FAST','test_driver_05@fast.invalid','+242060000005'),
    ('TEST_DRIVER_06','driver','TEST_Driver06','FAST','test_driver_06@fast.invalid','+242060000006'),
    ('TEST_DRIVER_07','driver','TEST_Driver07','FAST','test_driver_07@fast.invalid','+242060000007'),
    ('TEST_DRIVER_08','driver','TEST_Driver08','FAST','test_driver_08@fast.invalid','+242060000008'),
    ('TEST_DRIVER_09','driver','TEST_Driver09','FAST','test_driver_09@fast.invalid','+242060000009'),
    ('TEST_DRIVER_10','driver','TEST_Driver10','FAST','test_driver_10@fast.invalid','+242060000010'),
    ('TEST_CLIENT_01','client','TEST_Client01','FAST','test_client_01@fast.invalid','+242065000001'),
    ('TEST_CLIENT_02','client','TEST_Client02','FAST','test_client_02@fast.invalid','+242065000002'),
    ('TEST_CLIENT_03','client','TEST_Client03','FAST','test_client_03@fast.invalid','+242065000003')
), prepared as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid, code) id,
         code,account_role,first_name,last_name,lower(email) email,phone
  from test_users
)
insert into auth.identities (provider_id,user_id,identity_data,provider,created_at,updated_at)
select
  id::text,
  id,
  jsonb_build_object(
    'sub',id::text,'role',account_role,'email',email,'phone',phone,
    'first_name',first_name,'last_name',last_name,'country_code','CG',
    'email_verified',true,'phone_verified',false,'test_fixture','TEST_ERP_FAST'
  ),
  'email',now(),now()
from prepared
on conflict (provider_id,provider) do update set
  identity_data=excluded.identity_data,
  updated_at=now();

-- Réaffirme explicitement les profils créés par le trigger Auth.
with test_users(code, account_role, first_name, last_name, email, phone) as (
  values
    ('TEST_DRIVER_01','driver','TEST_Driver01','FAST','test_driver_01@fast.invalid','+242060000001'),
    ('TEST_DRIVER_02','driver','TEST_Driver02','FAST','test_driver_02@fast.invalid','+242060000002'),
    ('TEST_DRIVER_03','driver','TEST_Driver03','FAST','test_driver_03@fast.invalid','+242060000003'),
    ('TEST_DRIVER_04','driver','TEST_Driver04','FAST','test_driver_04@fast.invalid','+242060000004'),
    ('TEST_DRIVER_05','driver','TEST_Driver05','FAST','test_driver_05@fast.invalid','+242060000005'),
    ('TEST_DRIVER_06','driver','TEST_Driver06','FAST','test_driver_06@fast.invalid','+242060000006'),
    ('TEST_DRIVER_07','driver','TEST_Driver07','FAST','test_driver_07@fast.invalid','+242060000007'),
    ('TEST_DRIVER_08','driver','TEST_Driver08','FAST','test_driver_08@fast.invalid','+242060000008'),
    ('TEST_DRIVER_09','driver','TEST_Driver09','FAST','test_driver_09@fast.invalid','+242060000009'),
    ('TEST_DRIVER_10','driver','TEST_Driver10','FAST','test_driver_10@fast.invalid','+242060000010'),
    ('TEST_CLIENT_01','client','TEST_Client01','FAST','test_client_01@fast.invalid','+242065000001'),
    ('TEST_CLIENT_02','client','TEST_Client02','FAST','test_client_02@fast.invalid','+242065000002'),
    ('TEST_CLIENT_03','client','TEST_Client03','FAST','test_client_03@fast.invalid','+242065000003')
), prepared as (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid, code) id,
         account_role,first_name,last_name,lower(email) email,phone
  from test_users
)
insert into public.profiles(id,role,first_name,last_name,phone,email,country_code,created_at,updated_at)
select id,account_role::public.fast_user_role,first_name,last_name,phone,email,'CG',now(),now()
from prepared
on conflict(id) do update set
  role=excluded.role,first_name=excluded.first_name,last_name=excluded.last_name,
  phone=excluded.phone,email=excluded.email,country_code='CG',updated_at=now();

-- Les chauffeurs restent opérationnellement offline pendant tous les tests ERP.
with d as (
  select g as n,
         extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
           'TEST_DRIVER_'||lpad(g::text,2,'0')) as id
  from generate_series(1,10) g
)
insert into public.drivers(user_id,status,is_verified,rating,total_rides,created_at,updated_at)
select id,'offline'::public.driver_status,false,round((4.20+n*0.05)::numeric,2),n*7,now(),now()
from d
on conflict(user_id) do update set
  status='offline'::public.driver_status,
  rating=excluded.rating,total_rides=excluded.total_rides,updated_at=now();

-- Un véhicule par chauffeur, plaques TEST_ uniques.
with d as (
  select g as n,
         extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
           'TEST_DRIVER_'||lpad(g::text,2,'0')) as driver_id,
         extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
           'TEST_VEHICLE_'||lpad(g::text,2,'0')) as vehicle_id
  from generate_series(1,10) g
)
insert into public.vehicles(id,driver_id,make,model,color,plate_number,seats,is_active,vehicle_type,created_at)
select vehicle_id,driver_id,'TEST_Toyota','TEST_Corolla_'||lpad(n::text,2,'0'),'Blanc',
       'TEST-FAST-'||lpad(n::text,3,'0'),4,true,'standard',now()
from d
on conflict(id) do update set
  driver_id=excluded.driver_id,make=excluded.make,model=excluded.model,color=excluded.color,
  plate_number=excluded.plate_number,seats=4,is_active=true,vehicle_type='standard';

-- Contrôles administratifs variés : pending / validated / invalidated.
with d as (
  select g as n,
         extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
           'TEST_DRIVER_'||lpad(g::text,2,'0')) as id
  from generate_series(1,10) g
)
insert into public.account_admin_controls(
  user_id,account_role,admin_status,is_active,internal_reason,
  validated_at,invalidated_at,created_at,updated_at
)
select
  id,'driver',
  case when n in (3,6,9) then 'invalidated'
       when n in (2,5,8,10) then 'validated'
       else 'pending' end,
  case when n in (3,6,9) then false else true end,
  case when n in (3,6,9) then 'TEST_INVALIDATION_ERP'
       when n in (2,5,8,10) then 'TEST_VALIDATION_ERP'
       else 'TEST_PENDING_ERP' end,
  case when n in (2,5,8,10) then now() - interval '2 days' else null end,
  case when n in (3,6,9) then now() - interval '1 day' else null end,
  now(),now()
from d
on conflict(user_id) do update set
  account_role=excluded.account_role,admin_status=excluded.admin_status,is_active=excluded.is_active,
  internal_reason=excluded.internal_reason,validated_at=excluded.validated_at,
  invalidated_at=excluded.invalidated_at,updated_at=now();

-- Trois clients de test ; TEST_CLIENT_03 est explicitement invalidated/inactif.
with c as (
  select g as n,
         extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
           'TEST_CLIENT_'||lpad(g::text,2,'0')) as id
  from generate_series(1,3) g
)
insert into public.account_admin_controls(
  user_id,account_role,admin_status,is_active,internal_reason,
  validated_at,invalidated_at,created_at,updated_at
)
select id,'client',
       case when n=3 then 'invalidated' when n=1 then 'validated' else 'pending' end,
       case when n=3 then false else true end,
       case when n=3 then 'TEST_CLIENT_INVALIDATED_END_TO_END'
            when n=1 then 'TEST_CLIENT_VALIDATED' else 'TEST_CLIENT_PENDING' end,
       case when n=1 then now()-interval '1 day' else null end,
       case when n=3 then now() else null end,
       now(),now()
from c
on conflict(user_id) do update set
  account_role=excluded.account_role,admin_status=excluded.admin_status,is_active=excluded.is_active,
  internal_reason=excluded.internal_reason,validated_at=excluded.validated_at,
  invalidated_at=excluded.invalidated_at,updated_at=now();

-- Documents : chauffeur 1 = dossier complet approuvé ; chauffeur 2 = identité refusée ;
-- chauffeur 3 = identité en attente. Les autres pièces des chauffeurs 2/3 sont approuvées.
-- Les storage_path TEST_ sont des métadonnées de fixture ; l'upload de fichiers physiques
-- doit être réalisé pendant le test preview pour valider l'ouverture d'un document signé.
with drivers as (
  select g as n,
         extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
           'TEST_DRIVER_'||lpad(g::text,2,'0')) as driver_id
  from generate_series(1,3) g
), docs(document_type) as (
  values ('identity'),('license'),('vehicle_registration'),('insurance'),('driver_photo'),('address_proof')
), prepared as (
  select
    extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
      'TEST_DOC_'||lpad(d.n::text,2,'0')||'_'||docs.document_type) as id,
    d.n,d.driver_id,docs.document_type,
    'TEST_DRIVER_'||lpad(d.n::text,2,'0')||'/'||docs.document_type||'.pdf' as storage_path,
    'TEST_DRIVER_'||lpad(d.n::text,2,'0')||'_'||docs.document_type||'.pdf' as file_name,
    case
      when d.n=2 and docs.document_type='identity' then 'rejected'
      when d.n=3 and docs.document_type='identity' then 'pending'
      else 'approved'
    end as status
  from drivers d cross join docs
)
insert into public.driver_documents(
  id,driver_id,document_type,storage_path,file_name,status,rejection_reason,
  created_at,reviewed_at,country_code,mime_type,file_size_bytes,expires_at,reviewed_by
)
select
  id,driver_id,document_type,storage_path,file_name,status,
  case when status='rejected' then 'TEST_DOCUMENT_ILLISIBLE' else null end,
  now()-interval '5 days',case when status='pending' then null else now()-interval '2 days' end,
  'CG','application/pdf',2048,date '2027-12-31',null
from prepared
on conflict(id) do update set
  status=excluded.status,rejection_reason=excluded.rejection_reason,
  reviewed_at=excluded.reviewed_at,expires_at=excluded.expires_at;

-- Règles de commission versionnées :
-- ancienne 15 % du 01/08 au 05/09 ; nouvelle 18 % à partir du 01/09.
-- Le chevauchement 01/09-05/09 vérifie que la règle la plus récente prend le relais.
insert into public.commission_rules(
  id,commission_type,value,scope_type,driver_id,vehicle_type,currency,
  valid_from,valid_until,is_active,created_at
)
values
(
  extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,'TEST_COMMISSION_OLD'),
  'percentage',15,'global',null,null,'XAF',
  timestamptz '2026-08-01 00:00:00+01',timestamptz '2026-09-05 00:00:00+01',true,
  timestamptz '2026-08-01 00:00:00+01'
),
(
  extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,'TEST_COMMISSION_NEW'),
  'percentage',18,'global',null,null,'XAF',
  timestamptz '2026-09-01 00:00:00+01',null,true,
  timestamptz '2026-09-01 00:00:00+01'
)
on conflict(id) do nothing;

-- 36 courses sur juillet/août/septembre 2026.
-- Les 11 premières sont antérieures au 01/08 : au moins 5 courses sans règle de commission.
-- Les heures 23:30 et 02:00 couvrent la nuit ; la cadence de 2 jours couvre des week-ends ;
-- g=19 tombe le 15/08/2026 pour le scénario jour férié à valider côté moteur tarifaire.
with base as (
  select g,
    ((date '2026-07-10' + ((g-1)*2)) +
      case when g % 7 = 0 then time '02:00'
           when g % 5 = 0 then time '23:30'
           else time '14:00' end) at time zone 'Africa/Brazzaville' as requested_at,
    ((g-1) % 10)+1 as driver_n,
    ((g-1) % 3)+1 as client_n
  from generate_series(1,36) g
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
    case
      when g in (10,21,32) then 'in_progress'::public.ride_status
      when g % 6 = 0 then 'cancelled'::public.ride_status
      else 'completed'::public.ride_status
    end as ride_status,
    (2000 + g*125)::numeric as price
  from base
)
insert into public.rides(
  id,client_id,driver_id,vehicle_id,status,
  pickup_address,pickup_lat,pickup_lng,destination_address,destination_lat,destination_lng,
  estimated_distance_km,estimated_duration_min,estimated_price,final_price,currency,
  requested_at,accepted_at,started_at,completed_at,cancelled_at,created_at,updated_at,
  requested_vehicle_type,driver_eta_min,dispatch_attempts,surge_multiplier,
  pickup_confirmed,destination_confirmed,pickup_country_code,pickup_country_name,
  destination_country_code,destination_country_name,payment_method,pricing_mode,
  agreed_price,standard_price,cancellation_reason,cancellation_note,
  cancelled_by_role,payment_state,payment_timing,payment_due_amount,
  payment_confirmed_at,cash_received_at
)
select
  ride_id,client_id,driver_id,vehicle_id,ride_status,
  'TEST_PICKUP_'||lpad(g::text,3,'0')||'_Brazzaville',
  -4.2634 + (g::double precision/10000),15.2429 + (g::double precision/10000),
  'TEST_DESTINATION_'||lpad(g::text,3,'0')||'_Brazzaville',
  -4.2750 + (g::double precision/10000),15.2850 + (g::double precision/10000),
  round((3.5 + (g%8)*0.7)::numeric,2),15+(g%20),price,
  case when ride_status='completed' then price else null end,
  'XAF',
  requested_at,
  case when ride_status<>'cancelled' then requested_at+interval '5 minutes' else null end,
  case when ride_status in ('in_progress','completed') then requested_at+interval '10 minutes' else null end,
  case when ride_status='completed' then requested_at+interval '50 minutes' else null end,
  case when ride_status='cancelled' then requested_at+interval '3 minutes' else null end,
  requested_at,
  case when ride_status='completed' then requested_at+interval '50 minutes' else requested_at+interval '10 minutes' end,
  'standard',5+(g%9),1,1,
  ride_status<>'cancelled',ride_status<>'cancelled','CG','République du Congo','CG','République du Congo',
  'cash','standard',price,price,
  case when ride_status='cancelled' then 'TEST_ADMIN_VALIDATION' else null end,
  case when ride_status='cancelled' then 'TEST_ANNULATION_FIXTURE' else null end,
  case when ride_status='cancelled' then 'system' else null end,
  case when ride_status='completed' then 'cash_received'
       when ride_status='in_progress' then 'cash_due'
       else 'unpaid' end,
  'on_arrival',
  case when ride_status in ('completed','in_progress') then price else null end,
  case when ride_status='completed' then requested_at+interval '50 minutes' else null end,
  case when ride_status='completed' then requested_at+interval '50 minutes' else null end
from prepared
on conflict(id) do nothing;

-- Événement explicite pour faciliter l'identification des fixtures dans l'historique.
insert into public.ride_events(ride_id,event_type,actor_user_id,payload,created_at)
select r.id,'TEST_fixture_created',null,jsonb_build_object('fixture','TEST_ERP_FAST'),r.created_at
from public.rides r
where r.id in (
  select extensions.uuid_generate_v5('5f5a5354-4552-505f-5445-53545f455250'::uuid,
    'TEST_RIDE_'||lpad(g::text,3,'0')) from generate_series(1,36) g
)
and not exists (
  select 1 from public.ride_events e where e.ride_id=r.id and e.event_type='TEST_fixture_created'
);

commit;

-- Contrôle attendu après exécution :
-- 10 chauffeurs TEST_, 3 clients TEST_, 36 courses TEST_, 18 documents TEST_, 2 règles de commission TEST_.
-- Ne pas considérer l'étape 2 validée avant vérification par requêtes de comptage.
