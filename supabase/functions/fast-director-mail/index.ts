import nodemailer from "npm:nodemailer@6.10.1";
const U=Deno.env.get("SUPABASE_URL")||""; const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const DESTINATION="servaisgloire@gmail.com";
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
async function rest(path,init={}){const h=new Headers(init.headers||{});h.set("apikey",K);if(!K.startsWith("sb_secret_"))h.set("authorization","Bearer "+K);if(!h.has("content-type"))h.set("content-type","application/json");
 const r=await fetch(U+"/rest/v1/"+path,{...init,headers:h});const t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=t};if(!r.ok)throw Error("REST "+r.status+" "+String(d?.message||"").slice(0,60));return d;}
async function sha(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("");}
function equal(a,b){if(!a||!b||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function safeList(path){try{return await rest(path)||[]}catch{return []}}
const tParis=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).reduce((a,p)=>({...a,[p.type]:p.value}),{});
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false,error:"POST required"},405);
 try{
 const raw=req.headers.get("x-agent-token")||"";
 if(!raw||raw.length>512)return json({ok:false,error:"Unauthorized"},401);
 const reg=await rest("fast_agent_registry?agent_code=eq.AGENT_G&select=token_hash,status&limit=1");
 if(reg?.[0]?.status!=="active"||!equal(String(reg[0].token_hash||""),await sha(raw)))return json({ok:false,error:"Unauthorized"},401);
 const input=await req.json().catch(()=>({}));const time=tParis();
 const isDaily=time.hour==="08" && Number(time.minute)<2;
 const isManual=input.mode==="owner_initial_report" && input.owner_requested===true;
 const incidents=await safeList("fast_agent_tasks?kind=eq.website_availability_incident&status=in.(queued,in_progress,blocked)&select=id,priority,kind,payload,created_at&order=created_at.desc&limit=12");
 const critical=incidents.filter(x=>x.priority==="critical");
 const needAlert=critical.length>0;
 if(!isDaily&&!isManual&&!needAlert)return json({ok:true,skipped:true,reason:"No report due"});
 const type=isManual?"activation":isDaily?"daily":"incident";
 let key=type==="daily"?"daily:"+time.year+time.month+time.day:
  type==="activation"?"activation:2026-10-15":
  "critical:"+critical.map(x=>x.id).sort().join("_").slice(0,1200);
 const existing=await safeList("fast_director_mail_log?message_key=eq."+encodeURIComponent(key)+"&select=id,status&limit=1");
 if(existing.length){
   // Only an explicit owner-triggered test can retry a failed report;
   // preserve the initial failure record, never resend an accepted report.
   if(existing[0].status!=="failed" || !isManual || input.force_retry!==true)
     return json({ok:true,skipped:true,reason:"Already recorded",status:existing[0].status});
   key += ":retry:"+time.year+time.month+time.day+time.hour+time.minute;
   const retry=await safeList("fast_director_mail_log?message_key=eq."+encodeURIComponent(key)+"&select=id,status&limit=1");
   if(retry.length)return json({ok:true,skipped:true,reason:"Retry already recorded",status:retry[0].status});
 }
 const agents=await rest("fast_agent_registry?select=agent_code,display_name,status,last_seen_at&order=display_name.asc");
 const checks=await safeList("fast_org_web_checks?select=service_name,classification,http_status,checked_at&order=checked_at.desc&limit=24");
 const dedup=new Map();for(const c of checks)if(!dedup.has(c.service_name))dedup.set(c.service_name,c);
 const subject=(type==="incident"?"[ALERTE CRITIQUE] ":type==="activation"?"[ACTIVATION] ":"[RAPPORT] ")+"FAST N°1 — Direction générale, "+time.day+"/"+time.month+"/"+time.year;
 await rest("fast_director_mail_log",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({message_key:key,to_email:DESTINATION,subject,status:"preparing"})});
 const report=[
 "FAST N°1 — Rapport opérationnel de Gabriel (Direction générale)",
 "Date locale: "+time.day+"/"+time.month+"/"+time.year+" "+time.hour+":"+time.minute,
 "Agents répertoriés : "+agents.length+" ; actifs : "+agents.filter(x=>x.status==="active").length,
 "Services :",
 ...[...dedup.values()].map(c=>"- "+c.service_name+": "+c.classification+" (HTTP "+String(c.http_status||"n/a")+")"),
 "Incidents de maintenance ouverts : "+incidents.length,
 ...incidents.slice(0,6).map(x=>"- "+x.priority+": "+String(x.payload?.service||x.kind)),
 "Agents :",
 ...agents.map(a=>"- "+a.display_name+" / "+a.status+" / dernier cycle : "+(a.last_seen_at||"non observé")),
 "Les modifications sensibles exigent une validation. Aucune suppression de données n'est autorisée.",
 "Répondre à ce mail ne pilote PAS encore automatiquement les agents : l'intégration de la boîte entrante doit être reliée."
 ].join("\n");
 try{
 const c=await rest("rpc/get_fast_mail_secrets",{method:"POST",body:"{}"});
 const secrets=Array.isArray(c)?c[0]:c;
 if(!secrets?.smtp_user||!secrets?.smtp_password||!secrets?.smtp_host)throw Error("SMTP configuration unavailable");
 const port=Number(secrets.smtp_port||587);
 const tx=nodemailer.createTransport({host:secrets.smtp_host,port,secure:port===465,requireTLS:port!==465,auth:{user:secrets.smtp_user,pass:secrets.smtp_password},tls:{minVersion:"TLSv1.2"}});
 const response=await tx.sendMail({from:'"Gabriel - Direction FAST N°1" <'+secrets.smtp_user+'>',to:DESTINATION,replyTo:secrets.smtp_user,subject,text:report,html:'<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">'+esc(report)+'</div>'});
 await rest("fast_director_mail_log?message_key=eq."+encodeURIComponent(key),{method:"PATCH",body:JSON.stringify({status:"sent",from_email:secrets.smtp_user,sent_at:new Date().toISOString(),error:null})});
 return json({ok:true,mail_accepted_by_smtp:true,message_key:key,recipient:DESTINATION,from:secrets.smtp_user,report_type:type,agents:agents.length,provider_message_id_present:!!response.messageId});
 }catch(e){
 const error=String(e instanceof Error?e.message:e).slice(0,160).replace(/[a-z0-9_-]{28,}/gi,"[redacted]");
 await rest("fast_director_mail_log?message_key=eq."+encodeURIComponent(key),{method:"PATCH",body:JSON.stringify({status:"failed",error})});
 return json({ok:false,error:"SMTP report delivery failed",logged:true},502);
 }
 }catch(e){return json({ok:false,error:String(e instanceof Error?e.message:e).slice(0,120)},500)}
});
