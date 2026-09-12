import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/server';
export async function reviewDocument(id:string,status:'approved'|'rejected',reason=''){const {error}=await supabaseAdmin().from('driver_documents').update({status,rejection_reason:status==='rejected'?reason:null,reviewed_at:new Date().toISOString()}).eq('id',id);if(error)throw error;}
export async function getSignedDocumentUrl(id:string){const db=supabaseAdmin();const {data,error}=await db.from('driver_documents').select('storage_path,file_name').eq('id',id).single();if(error)throw error;const {data:signed,error:sError}=await db.storage.from('driver-documents').createSignedUrl(data.storage_path,300);if(sError)throw sError;return {url:signed.signedUrl,fileName:data.file_name};}
