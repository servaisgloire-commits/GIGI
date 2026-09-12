import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';

async function query<T>(table:string,select='*'){
  const {data,error}=await supabaseAdmin().from(table).select(select);
  if(error) throw error;
  return (data||[]) as T[];
}
export const getProfiles=()=>query<any>('profiles','id,role,first_name,last_name,phone,email,country_code,created_at,updated_at');
export const getDrivers=()=>query<any>('drivers','user_id,status,is_verified,rating,total_rides,created_at,updated_at');
export const getDocuments=()=>query<any>('driver_documents','id,driver_id,document_type,storage_path,file_name,status,rejection_reason,country_code,mime_type,file_size_bytes,expires_at,created_at,reviewed_at');
export const getVehicles=()=>query<any>('vehicles','id,driver_id,make,model,color,plate_number,seats,is_active,vehicle_type,created_at');
export const getRides=()=>query<any>('rides','id,client_id,driver_id,vehicle_id,status,pickup_address,destination_address,estimated_price,final_price,agreed_price,currency,requested_vehicle_type,payment_method,requested_at,accepted_at,started_at,completed_at,cancelled_at,created_at');
export const getPayments=()=>query<any>('payments','id,ride_id,user_id,method_type,provider,amount,currency,status,created_at,paid_at');
export const getPricing=()=>query<any>('market_pricing','id,country_code,service_type,base_fare,per_km,per_minute,minimum_fare,booking_fee,night_multiplier,weekend_multiplier,holiday_multiplier,currency,is_active,updated_at');
export const getPricingHistory=()=>query<any>('pricing_history');
export const getCommissionRules=()=>query<any>('commission_rules');
export const getAccountControls=()=>query<any>('account_admin_controls');
export const getSettings=()=>query<any>('app_settings');
