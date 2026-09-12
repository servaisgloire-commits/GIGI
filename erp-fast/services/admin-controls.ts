import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function setAccountControl(input:{userId:string;role:'client'|'driver';status:'pending'|'validated'|'invalidated';active:boolean;reason?:string}){
  const now=new Date().toISOString();
  const row={user_id:input.userId,account_role:input.role,admin_status:input.status,is_active:input.active,internal_reason:input.reason?.trim()||null,validated_at:input.status==='validated'?now:null,invalidated_at:input.status==='invalidated'?now:null,updated_at:now};
  const {error}=await supabaseAdmin().from('account_admin_controls').upsert(row,{onConflict:'user_id'});if(error)throw error;
}
