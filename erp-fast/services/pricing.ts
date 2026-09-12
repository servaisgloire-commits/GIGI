import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';

const FIELDS=['base_fare','per_km','per_minute','minimum_fare','booking_fee','night_multiplier','weekend_multiplier','holiday_multiplier'] as const;
export async function updatePricing(id:string,input:Record<string,number>){
  const db=supabaseAdmin();const {data:old,error:readError}=await db.from('market_pricing').select('*').eq('id',id).single();if(readError)throw readError;
  const patch:Object=Object.fromEntries(FIELDS.map(k=>[k,Number(input[k])]));
  const next={...old,...patch,updated_at:new Date().toISOString()};
  const {error:hError}=await db.from('pricing_history').insert({pricing_id:id,country_code:old.country_code,service_type:old.service_type,old_pricing:old,new_pricing:next,effective_at:new Date().toISOString()});if(hError)throw hError;
  const {error:uError}=await db.from('market_pricing').update(patch).eq('id',id);if(uError)throw uError;
}
