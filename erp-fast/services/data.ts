import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';

async function query<T>(table:string,select='*',orderColumn='created_at',ascending=false){
  const db=supabaseAdmin();
  const pageSize=1000;
  const rows:T[]=[];
  for(let from=0;from<100000;from+=pageSize){
    let q=db.from(table).select(select).range(from,from+pageSize-1);
    if(orderColumn)q=q.order(orderColumn,{ascending});
    const {data,error}=await q;
    if(error)throw error;
    const page=(data||[]) as T[];
    rows.push(...page);
    if(page.length<pageSize)return rows;
  }
  throw new Error(`FAST ERP: volume supérieur à la limite de sécurité pour ${table}`);
}

export const getProfiles=()=>query<any>('profiles','id,role,first_name,last_name,phone,email,country_code,created_at,updated_at');
export const getDrivers=()=>query<any>('drivers','user_id,status,is_verified,rating,total_rides,created_at,updated_at');
export const getDocuments=()=>query<any>('driver_documents','id,driver_id,document_type,storage_path,file_name,status,rejection_reason,country_code,mime_type,file_size_bytes,expires_at,created_at,reviewed_at');
export const getVehicles=()=>query<any>('vehicles','id,driver_id,make,model,color,plate_number,seats,is_active,vehicle_type,photo_path,created_at');
export const getRides=()=>query<any>('rides','id,client_id,driver_id,vehicle_id,status,pickup_address,destination_address,estimated_price,final_price,agreed_price,currency,requested_vehicle_type,payment_method,requested_at,accepted_at,started_at,completed_at,cancelled_at,created_at');
export const getPayments=()=>query<any>('payments','id,ride_id,user_id,method_type,provider,amount,currency,status,created_at,paid_at');
export const getPricing=()=>query<any>('market_pricing','id,country_code,service_type,base_fare,per_km,per_minute,minimum_fare,booking_fee,night_multiplier,weekend_multiplier,holiday_multiplier,currency,is_active,updated_at','updated_at',false);
export const getPricingHistory=()=>query<any>('pricing_history','*','effective_at',false);
export const getCommissionRules=()=>query<any>('commission_rules');
export const getAccountControls=()=>query<any>('account_admin_controls');
export const getSettings=()=>query<any>('app_settings','*','updated_at',false);

export async function getVehiclePhotoUrl(path?:string|null){
  const clean=String(path||'').trim();
  if(!clean)return null;
  const {data,error}=await supabaseAdmin().storage.from('vehicle-photos').createSignedUrl(clean,3600);
  if(error)return null;
  return data?.signedUrl||null;
}
