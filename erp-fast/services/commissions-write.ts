import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';
export async function createCommissionRule(input:{commission_type:'percentage'|'fixed';value:number;scope_type:'global'|'driver'|'vehicle_category';driver_id?:string|null;vehicle_type?:string|null;currency:string;valid_from:string;valid_until?:string|null}){
  const row={...input,driver_id:input.scope_type==='driver'?input.driver_id:null,vehicle_type:input.scope_type==='vehicle_category'?input.vehicle_type:null,is_active:true};
  const {error}=await supabaseAdmin().from('commission_rules').insert(row);if(error)throw error;
}
