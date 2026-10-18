import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ITERATIONS=310000;
const SESSION_TTL_MS=8*60*60*1000;
const enc=new TextEncoder();
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, x-fast-admin-token","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Cache-Control":"no-store"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const fail=(message:string,status=400)=>json({ok:false,error:message},status);
function b64ToBytes(s:string){const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function bytesToB64(bytes:Uint8Array){let s="";bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s)}
function b64url(bytes:Uint8Array){return bytesToB64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function b64urlText(text:string){return b64url(enc.encode(text))}
function fromB64urlText(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return new TextDecoder().decode(b64ToBytes(s))}
function sameBytes(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0}
async function derive(password:string,salt:Uint8Array,iterations=ITERATIONS){const base=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},base,256);return new Uint8Array(bits)}
async function hmac(input:string){const key=await crypto.subtle.importKey("raw",enc.encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(input)))}
async function issueSession(username:string){const payload=b64urlText(JSON.stringify({u:"admin",a:username,exp:Date.now()+SESSION_TTL_MS}));return `${payload}.${b64url(await hmac(payload))}`}
async function requireSession(req:Request){const token=req.headers.get("x-fast-admin-token")||"";const [payload,sig]=token.split(".");if(!payload||!sig)return null;const expected=b64url(await hmac(payload));if(expected.length!==sig.length)return null;let diff=0;for(let i=0;i<sig.length;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i);if(diff!==0)return null;try{const data=JSON.parse(fromB64urlText(payload));return data.u==="admin"&&Number(data.exp)>Date.now()?data:null}catch{return null}}
async function serviceFetch(path:string,init:RequestInit={}){const headers=new Headers(init.headers||{});headers.set("apikey",SERVICE_KEY);headers.set("Authorization",`Bearer ${SERVICE_KEY}`);if(!headers.has("Content-Type"))headers.set("Content-Type","application/json");const r=await fetch(`${SUPABASE_URL}${path}`,{...init,headers});let data:any=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(data?.message||data?.hint||data?.error||`Supabase ${r.status}`);return data}
async function body(req:Request){try{return await req.json()}catch{return{}}}
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));
const finite=(v:unknown)=>Number.isFinite(Number(v));
async function audit(username:string,action:string,targetType?:string,targetId?:string,details:Record<string,unknown>={}){try{await serviceFetch("/rest/v1/fast_admin_audit",{method:"POST",body:JSON.stringify({username,action,target_type:targetType||null,target_id:targetId||null,details})})}catch{}}
async function snapshot(){const specs=[
["profiles","id,role,first_name,last_name,phone,country_code,created_at"],
["drivers","user_id,status,is_verified,rating,total_rides,created_at,updated_at"],
["driver_locations","driver_id,country_code,country_name,latitude,longitude,accuracy_m,updated_at"],
["vehicles","id,driver_id,make,model,color,plate_number,seats,is_active,vehicle_type,created_at"],
["driver_documents","id,driver_id,document_type,storage_path,file_name,status,rejection_reason,country_code,mime_type,file_size_bytes,expires_at,created_at,reviewed_at,reviewed_by"],
["driver_payout_profiles","driver_id,payout_method,account_holder,phone_number,mobile_operator,bank_name,iban_or_account,bank_bic_swift,country_code,payout_currency,is_complete,payout_status,verified_at,updated_at"],
["rides","id,client_id,driver_id,status,pickup_address,destination_address,estimated_price,standard_price,customer_proposed_price,agreed_price,final_price,currency,payment_method,pickup_country_code,pickup_country_name,cancellation_reason,cancelled_by,requested_at,created_at"],
["payments","id,ride_id,user_id,method_type,provider,provider_reference,amount,currency,status,failure_reason,metadata,created_at,paid_at"],
["market_configs","country_code,country_name,currency,locale,enabled,payment_methods,payout_methods,mobile_money_operators,document_requirements,updated_at"],
["market_pricing","id,country_code,service_type,base_fare,per_km,per_minute,minimum_fare,booking_fee,currency,is_active,updated_at"]];const values=await Promise.all(specs.map(([t,s])=>serviceFetch(`/rest/v1/${t}?select=${encodeURIComponent(s)}&limit=5000`)));return Object.fromEntries(specs.map(([t],i)=>[t,values[i]||[]]))}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const url=new URL(req.url),marker="/fast-admin-api",pos=url.pathname.indexOf(marker),path=pos>=0?url.pathname.slice(pos+marker.length)||"/":url.pathname;
 try{
  if(req.method==="GET"&&path==="/health")return json({ok:true,service:"FAST admin",version:4});
  if(req.method==="POST"&&path==="/register"){
   const b=await body(req),username=String(b.username||"").trim().toLowerCase(),displayName=String(b.display_name||"Administrateur FAST").trim().slice(0,120)||"Administrateur FAST",password=String(b.password||"");
   if(!/^[a-z0-9._-]{3,40}$/.test(username))return fail("Identifiant invalide : 3 à 40 caractères, lettres, chiffres, point, tiret ou underscore.");
   if(password.length<8)return fail("Le mot de passe doit contenir au moins 8 caractères.");
   const existing=await serviceFetch(`/rest/v1/fast_admin_users?username=eq.${encodeURIComponent(username)}&select=id,is_active&limit=1`);
   if(existing?.length)return fail("Cet identifiant existe déjà.",409);
   const salt=crypto.getRandomValues(new Uint8Array(16)),hash=await derive(password,salt);
   await serviceFetch("/rest/v1/fast_admin_users",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({username,display_name:displayName,credential_hash:bytesToB64(hash),credential_salt:bytesToB64(salt),credential_iterations:ITERATIONS,role:"admin",is_active:false})});
   return json({ok:true,status:"pending",message:"Compte créé. Activez is_active dans fast_admin_users sur Supabase pour autoriser la connexion."},201);
  }
  if(req.method==="POST"&&path==="/login"){
   const b=await body(req),username=String(b.username||"").trim().toLowerCase(),password=String(b.password||"");
   const rows=await serviceFetch(`/rest/v1/fast_admin_users?username=eq.${encodeURIComponent(username)}&select=username,display_name,credential_hash,credential_salt,credential_iterations,role,is_active&limit=1`),a=rows?.[0];
   if(!a){await new Promise(r=>setTimeout(r,450));return fail("Identifiant ou mot de passe incorrect.",401)}
   if(!a.is_active)return fail("Compte en attente de validation dans Supabase.",403);
   const hash=await derive(password,b64ToBytes(a.credential_salt),Number(a.credential_iterations||ITERATIONS));
   if(!sameBytes(hash,b64ToBytes(a.credential_hash))){await new Promise(r=>setTimeout(r,450));return fail("Identifiant ou mot de passe incorrect.",401)}
   const token=await issueSession(username);await serviceFetch(`/rest/v1/fast_admin_users?username=eq.${encodeURIComponent(username)}`,{method:"PATCH",body:JSON.stringify({last_login_at:new Date().toISOString(),updated_at:new Date().toISOString()})});await audit(username,"login");
   return json({ok:true,token,expires_in:SESSION_TTL_MS/1000,identity:a.display_name||username,role:a.role});
  }
  const session=await requireSession(req);if(!session)return fail("Session administrateur expirée.",401);const username=String(session.a||"admin");
  if(req.method==="GET"&&path==="/snapshot")return json({ok:true,data:await snapshot()});
  if(req.method==="GET"&&path==="/business-workflows"){
    const [items,runs]=await Promise.all([
      serviceFetch("/rest/v1/fast_business_work_items?select=id,work_key,workflow,owner_department,priority,status,reason_codes,human_review_required,first_seen_at,last_seen_at,resolved_at&order=last_seen_at.desc&limit=200"),
      serviceFetch("/rest/v1/fast_business_workflow_runs?select=id,workflow,status,result,executed_at&order=executed_at.desc&limit=30")
    ]);
    return json({ok:true,items:items||[],runs:runs||[],source:"automated_sql",
      notes:"No automatic licence or identity document approval"});
  }
  if(req.method==="POST"&&path==="/driver/verify"){const b=await body(req);if(!uuid(b.id))return fail("Chauffeur invalide");const value=!!b.value;await serviceFetch(`/rest/v1/drivers?user_id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify({is_verified:value,updated_at:new Date().toISOString()})});await audit(username,value?"driver_verified":"driver_verification_removed","driver",b.id);return json({ok:true})}
  if(req.method==="POST"&&path==="/document/review"){const b=await body(req);if(!uuid(b.id)||!["approved","rejected"].includes(String(b.status)))return fail("Document ou statut invalide");const reason=String(b.reason||"").trim();if(b.status==="rejected"&&!reason)return fail("Motif de refus requis");await serviceFetch(`/rest/v1/driver_documents?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify({status:b.status,rejection_reason:b.status==="rejected"?reason:null,reviewed_at:new Date().toISOString(),reviewed_by:null})});await audit(username,`document_${b.status}`,"document",b.id,reason?{reason}:{});return json({ok:true})}
  if(req.method==="POST"&&path==="/document/url"){const b=await body(req);if(!uuid(b.id))return fail("Document invalide");const rows=await serviceFetch(`/rest/v1/driver_documents?id=eq.${encodeURIComponent(b.id)}&select=storage_path,file_name&limit=1`),d=rows?.[0];if(!d?.storage_path)return fail("Fichier introuvable",404);const objectPath=String(d.storage_path).split("/").map(encodeURIComponent).join("/");const signed=await serviceFetch(`/storage/v1/object/sign/driver-documents/${objectPath}`,{method:"POST",body:JSON.stringify({expiresIn:300})});const raw=signed?.signedURL||signed?.signedUrl||"",signedUrl=raw.startsWith("http")?raw:`${SUPABASE_URL}/storage/v1${raw}`;return json({ok:true,url:signedUrl,file_name:d.file_name})}
  if(req.method==="POST"&&path==="/payout/verify"){const b=await body(req);if(!uuid(b.driver_id))return fail("Chauffeur invalide");await serviceFetch(`/rest/v1/driver_payout_profiles?driver_id=eq.${encodeURIComponent(b.driver_id)}`,{method:"PATCH",body:JSON.stringify({payout_status:"verified",verified_at:new Date().toISOString(),updated_at:new Date().toISOString()})});await audit(username,"payout_verified","driver",b.driver_id);return json({ok:true})}
  if(req.method==="POST"&&path==="/payment/verify"){const b=await body(req);if(!uuid(b.id))return fail("Paiement invalide");const rows=await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(b.id)}&select=id,ride_id,status,method_type,amount,currency,metadata&limit=1`),p=rows?.[0];if(!p)return fail("Paiement introuvable",404);const now=new Date().toISOString(),meta={...(p.metadata||{}),verified_by_admin:true,verified_at:now};await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify({status:"paid",paid_at:now,metadata:meta,updated_at:now})});if(p.ride_id)await serviceFetch("/rest/v1/ride_events",{method:"POST",body:JSON.stringify({ride_id:p.ride_id,event_type:"payment_verified",actor_user_id:null,payload:{payment_id:p.id,method_type:p.method_type,amount:p.amount,currency:p.currency}})}).catch(()=>{});await audit(username,"payment_verified","payment",b.id,{ride_id:p.ride_id,amount:p.amount,currency:p.currency});return json({ok:true})}
  if(req.method==="POST"&&path==="/payment/reject"){const b=await body(req);if(!uuid(b.id))return fail("Paiement invalide");const reason=String(b.reason||"Paiement non reçu").trim().slice(0,240);await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify({status:"failed",failure_reason:reason,updated_at:new Date().toISOString()})});await audit(username,"payment_rejected","payment",b.id,{reason});return json({ok:true})}
  if(req.method==="POST"&&path==="/market/save"){const b=await body(req),code=String(b.country_code||"").trim().toUpperCase(),currency=String(b.currency||"").trim().toUpperCase();if(!/^[A-Z]{2}$/.test(code)||!/^[A-Z]{3}$/.test(currency)||!String(b.country_name||"").trim())return fail("Pays ou devise invalide");const clean={country_code:code,country_name:String(b.country_name).trim(),currency,locale:String(b.locale||"fr-FR").trim(),enabled:b.enabled!==false,payment_methods:Array.isArray(b.payment_methods)?b.payment_methods.map(String).slice(0,20):[],payout_methods:Array.isArray(b.payout_methods)?b.payout_methods.map(String).slice(0,20):[],mobile_money_operators:Array.isArray(b.mobile_money_operators)?b.mobile_money_operators.map(String).slice(0,30):[],document_requirements:Array.isArray(b.document_requirements)?b.document_requirements.map(String).slice(0,30):[],updated_at:new Date().toISOString()};const existing=await serviceFetch(`/rest/v1/market_configs?country_code=eq.${encodeURIComponent(code)}&select=country_code&limit=1`);await serviceFetch(`/rest/v1/market_configs?on_conflict=country_code`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(clean)});if(!existing?.length)await serviceFetch("/rest/v1/market_pricing",{method:"POST",body:JSON.stringify({country_code:code,service_type:"standard",base_fare:0,per_km:0,per_minute:0,minimum_fare:0,booking_fee:0,currency,is_active:true})});await audit(username,existing?.length?"market_updated":"market_created","market",code);return json({ok:true})}
  if(req.method==="POST"&&path==="/pricing/update"){const b=await body(req);if(!uuid(b.id))return fail("Tarif invalide");const keys=["base_fare","per_km","per_minute","minimum_fare","booking_fee"];if(keys.some(k=>!finite(b[k])||Number(b[k])<0))return fail("Montants invalides");const currency=String(b.currency||"").toUpperCase();if(!/^[A-Z]{3}$/.test(currency))return fail("Devise invalide");const patch:Record<string,unknown>={currency,updated_at:new Date().toISOString()};keys.forEach(k=>patch[k]=Number(b[k]));await serviceFetch(`/rest/v1/market_pricing?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",body:JSON.stringify(patch)});await audit(username,"pricing_updated","pricing",b.id,patch);return json({ok:true})}
  return fail("Route administrateur inconnue.",404)
 }catch(e){console.error(e);return fail(String((e as any)?.message||e||"Erreur interne"),500)}
});