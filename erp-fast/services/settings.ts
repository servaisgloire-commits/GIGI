import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';
export async function saveSetting(key:string,raw:string){let value:any;try{value=JSON.parse(raw)}catch{value=raw}const {error}=await supabaseAdmin().from('app_settings').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});if(error)throw error;}
