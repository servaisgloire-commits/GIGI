// FAST organization runtime — independent read-only role missions.
// External social publishing, account creation, billing and production changes are never performed.
const PROJECT=Deno.env.get("SUPABASE_URL")||"";
function serviceKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS")||"{}";try{const v=JSON.parse(raw);return String(v.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");}catch{return String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");}}
const KEY=serviceKey();
const ALLOWED=["DESIGNER_G","PRODUCT_G","CLIENT_OPERATIONS_G","DRIVER_OPERATIONS_G","MAP_G","DISPATCH_G","MAXIME_FAST","ETIENNE_FAST","LEON_FAST","YAN_FAST","THEO_FAST","LINA_FAST","MAYA_FAST","AXEL_FAST"];
const sites=[
["Site officiel","https://fast-n1-officiel.vercel.app/","FAST N°1"],
["Administration","https://the-fast-n1-admin.vercel.app/","Connexion administrateur"],
["Admin JavaScript","https://the-fast-n1-admin.vercel.app/app.js","const API"],
["Admin CSS","https://the-fast-n1-admin.vercel.app/styles.css","box-sizing"],
["API FAST","https://fast-n1-python-api.vercel.app/health",'"ok"'],
["Téléchargement APK","https://fast-n1-officiel.vercel.app/api/download",""]
];
function j(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});}
async function sha(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,"0")).join("");}
function eq(a,b){if(!a||!b||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;}
async function rest(path,init={}){if(!PROJECT||!KEY)throw Error("server config missing");
 const headers=new Headers(init.headers||{});headers.set("apikey",KEY);
 if(!KEY.startsWith("sb_secret_"))headers.set("authorization","Bearer "+KEY);
 if(!headers.has("content-type"))headers.set("content-type","application/json");
 const res=await fetch(PROJECT+"/rest/v1/"+path,{...init,headers});
 const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data=text;}
 if(!res.ok)throw Error("REST "+res.status+" "+String(data?.message||data?.error||"").slice(0,100));
 return {data,headers:res.headers};
}
async function auth(req){const raw=req.headers.get("x-agent-token")||"";
 if(!raw||raw.length>512)return false;
 const r=await rest("fast_agent_registry?agent_code=eq.AGENT_G&select=token_hash,status&limit=1");
 return r.data?.[0]?.status==="active"&&eq(String(r.data[0].token_hash||""),await sha(raw));
}
async function count(table,filter="",column="id"){
 const x=await rest(table+"?select="+encodeURIComponent(column)+(filter?"&"+filter:""),{headers:{"Prefer":"count=exact","Range":"0-0"}});
 const raw=x.headers.get("content-range")||"";return Number(raw.split("/")[1]||0)||0;
}
async function checkSite(agentCode,name,url,expected){
 const t=Date.now();let httpStatus=0,classification="network_error",detail="";
 try{
  const response=await fetch(url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(6500),headers:{"User-Agent":"FAST-Organization-Health/1.0","Cache-Control":"no-cache"}});
  httpStatus=response.status;
  if(name==="Téléchargement APK" && httpStatus===302){const location=response.headers.get("location")||"";if(/^https:\/\/github\.com\/servaisgloire-commits\/GIGI\/releases\/download\//.test(location)){classification="ok";detail="Expected redirect to official FAST GitHub release";}else{classification="content_mismatch";detail="Download redirected outside authorized release path";}}
  else if([401,403,307,308,302,301].includes(httpStatus)){classification="restricted";detail="Restricted/redirected response"; }
  else if(httpStatus!==200){classification="unavailable";detail="HTTP "+httpStatus;}
  else {
    const body=(await response.text()).slice(0,180000);
    const mismatch=expected&&!body.includes(expected);
    classification=mismatch?"content_mismatch":"ok";
    detail=mismatch?"Expected public page marker missing":"HTTP 200 and marker verified";
  }
 }catch(e){detail=String(e instanceof Error?e.name+": "+e.message:e).slice(0,180);}
 await rest("fast_org_web_checks",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({agent_code:agentCode,service_name:name,url,http_status:httpStatus||null,classification,response_ms:Math.min(100000,Date.now()-t),detail})});
 return{name,classification,status:httpStatus||null};
}
async function issueMaintenanceTask(check){
 const key="fast:uptime:"+check.name.toLowerCase().replace(/[^a-z0-9]+/g,"_");
 const existing=await rest("fast_agent_tasks?dedupe_key=eq."+encodeURIComponent(key)+"&status=in.(queued,in_progress,blocked)&select=id&limit=1");
 if(existing.data?.length)return;
 const owner=check.name.toLowerCase().includes("admin")?"G_FAST_ADMIN":"PRODUCT_G";
 const priority=(check.status===404||check.classification==="unavailable")?"critical":"high";
 const proposal={agent_code:owner,kind:"website_availability_incident",dedupe_key:key,priority,status:"queued",
  payload:{service:check.name,classification:check.classification,http_status:check.status,
   recommendation:"Inspecter le déploiement Vercel, corriger les ressources manquantes, vérifier sur une prévisualisation et demander validation avant publication.",
   no_delete:true,owner_approval_required_for_production:true}};
 await rest("fast_agent_tasks",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify(proposal)});
 await rest("fast_agent_events",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({
   agent_code:"DESIGNER_G",severity:priority,category:"website_availability",title:"Anomalie de disponibilité : "+check.name,
   details:{service:check.name,classification:check.classification,http_status:check.status,assigned_to:owner,
    no_production_change:true}})});
}
async function webSnapshot(agent){const results=await Promise.all(sites.map(s=>checkSite(agent,...s)));
 if(agent==="DESIGNER_G")for(const check of results.filter(x=>x.classification!=="ok"))await issueMaintenanceTask(check);
 return{checks:results,unhealthy:results.filter(x=>x.classification!=="ok").map(x=>x.name)};}
async function operationalSnapshot(kind){
 const today=new Date(Date.now()-86400000).toISOString();
 if(kind==="rides")return{rides_24h:await count("rides","created_at=gte."+encodeURIComponent(today)),cancelled_24h:await count("rides","status=eq.cancelled&created_at=gte."+encodeURIComponent(today)),completed_24h:await count("rides","status=eq.completed&created_at=gte."+encodeURIComponent(today))};
 if(kind==="driver")return{unverified_drivers:await count("drivers","is_verified=eq.false","user_id"),pending_driver_documents:await count("driver_documents","status=eq.pending")};
 if(kind==="dispatch")return{pending_offers:await count("dispatch_offers","status=eq.pending"),expired_pending_offers:await count("dispatch_offers","status=eq.pending&expires_at=lt."+encodeURIComponent(new Date().toISOString()))};
 if(kind==="growth")return{rides_24h:await count("rides","created_at=gte."+encodeURIComponent(today)),completed_24h:await count("rides","status=eq.completed&created_at=gte."+encodeURIComponent(today))};
 return {};
}
async function recentChecks(){const x=await rest("fast_org_web_checks?select=service_name,classification,checked_at&order=checked_at.desc&limit=24");const seen=new Set();return (x.data||[]).filter(v=>{if(seen.has(v.service_name))return false;seen.add(v.service_name);return true;});}
async function existingReports(){const x=await rest("fast_org_deliverables?select=agent_code,status,mission,created_at&order=created_at.desc&limit=60");return x.data||[];}
async function buildMission(code){
 let mission="",title="",summary="",payload={},status="review";
 if(code==="DESIGNER_G"||code==="MAP_G"){
  const obs=await webSnapshot(code);mission=code==="DESIGNER_G"?"interface_health":"map_dependencies";
  title=code==="DESIGNER_G"?"Contrôle du site et de l'interface FAST":"Contrôle des services nécessaires à Carte & GPS";
  summary=obs.unhealthy.length?("Services à vérifier : "+obs.unhealthy.join(", ")):("Contrôles HTTP réussis. Les parcours sur mobile restent à tester.");
  payload={...obs,limitations:"Pas de simulation d'itinéraire, de clic mobile, ni de carte Google native."};
  status=obs.unhealthy.length?"review":"draft";
 } else if(code==="PRODUCT_G"){
  const [rides,checks]=await Promise.all([operationalSnapshot("rides"),recentChecks()]);
  mission="operational_overview";title="État du produit et des opérations FAST";summary="Bilan agrégé des courses et des vérifications récentes de disponibilité.";payload={rides,checks}; 
 } else if(code==="CLIENT_OPERATIONS_G"){
  const [rides,checks]=await Promise.all([operationalSnapshot("rides"),recentChecks()]);
  mission="client_journey";title="Suivi des parcours clients FAST";summary="Contrôle des volumes de courses et de la disponibilité générale, sans donnée personnelle.";payload={rides,checks,manual_checks:["Connexion client","Recherche d'adresse","Estimation du trajet","Commande test encadrée"]};
 } else if(code==="DRIVER_OPERATIONS_G"){
  const driver=await operationalSnapshot("driver");mission="driver_journey";title="Suivi du parcours chauffeur";summary="Contrôle des validations et documents chauffeurs en attente.";payload={driver,manual_checks:["Connexion chauffeur","Mode en ligne","Réception de la course test","Navigation GPS"]};
 } else if(code==="DISPATCH_G"){
  const dispatch=await operationalSnapshot("dispatch");mission="dispatch_watch";title="Contrôle des courses et du dispatch";summary=dispatch.expired_pending_offers?"Anomalie : offres expirées encore en attente.":"Suivi des demandes de dispatch en lecture seule.";payload={dispatch,allowed_effects:"none"};
 } else if(code==="MAXIME_FAST"){
  const [reports,checks]=await Promise.all([existingReports(),recentChecks()]);
  mission="compliance_review";title="Contrôle de conformité des agents FAST";
  summary="Vérification des comptes rendus et des risques d'accès sans publication ni modification.";
  payload={reported_agents:[...new Set(reports.map(x=>x.agent_code))],checks,guardrails:["Aucune suppression","Aucun paiement","Aucun déploiement","Aucune publication sans validation"]};
 } else if(code==="ETIENNE_FAST"){
  const [reports,checks]=await Promise.all([existingReports(),recentChecks()]);
  mission="independent_audit";title="Audit indépendant remis au propriétaire FAST";
  summary="Évaluation de la couverture des postes et de la santé des services, sans modification.";
  payload={reports_by_agent:reports.reduce((a,r)=>(a[r.agent_code]=(a[r.agent_code]||0)+1,a),{}),checks,independence:"Reports to owner; no modification authority"};
 } else if(code==="LEON_FAST"){
  const s=await operationalSnapshot("growth");mission="marketing_plan";title="Plan marketing FAST — à valider";
  summary="Préparer le positionnement mobilité, une campagne de présentation et des indicateurs mesurés.";payload={aggregate:s,priorities:["Clarifier le bénéfice client","Présenter l'application FAST sans promesse non vérifiée","Mettre en avant la simplicité du parcours"],external_publication:false};
 } else if(code==="YAN_FAST"){
  mission="social_coordination";title="Planning de coordination des pages officielles FAST";
  summary="Coordonner Théo, Lina, Maya et Axel avant toute publication.";payload={team:["THEO_FAST","LINA_FAST","MAYA_FAST","AXEL_FAST"],schedule:["Présentation FAST","Fonctionnement de la réservation","Conseils d'utilisation","Questions fréquentes"],external_accounts_connected:false};status="needs_connection";
 } else if(code==="THEO_FAST"){
  mission="official_accounts";title="Préparation des pages officielles FAST";
  summary="Inventaire des pages à connecter ; aucune page n'est créée automatiquement.";payload={channels:["Instagram","Facebook","TikTok","LinkedIn"],requirements:["Nom public FAST","Identité personnelle du propriétaire non publique","Vérification demandée par la plateforme si nécessaire"],external_accounts_connected:false};status="needs_connection";
 } else if(code==="LINA_FAST"){
  mission="social_drafts";title="Propositions de contenus FAST";
  summary="Trois brouillons internes, non publiés.";payload={drafts:[{theme:"Présentation",text:"FAST N°1 : découvrez une nouvelle façon de préparer vos trajets."},{theme:"Recherche d'adresse",text:"Choisissez votre point de départ et votre destination depuis FAST."},{theme:"Suivi",text:"Suivez les étapes de votre réservation dans l'application FAST."}],publish:false};
 } else if(code==="MAYA_FAST"){
  mission="community_responses";title="Réponses types aux communautés FAST";
  summary="Préparation des réponses avant modération humaine.";payload={templates:{information:"Bonjour, merci de votre intérêt pour FAST. Consultez nos canaux officiels pour les actualités.",support:"Bonjour, contactez le support FAST via l'application en précisant le problème, sans publier de données personnelles.",security:"Bonjour, ne communiquez jamais votre code PIN ou mot de passe en public."},send:false};status="needs_connection";
 } else if(code==="AXEL_FAST"){
  const s=await operationalSnapshot("growth");mission="growth_review";title="Analyse de croissance FAST";
  summary="Mesures agrégées des courses et propositions de suivi, sans dépenses publicitaires.";payload={metrics:s,tracking_gaps:["Visites du site","Installations vérifiées","Inscriptions","Conversions sans données personnelles"],spend:false};
 } else throw Error("Unassigned role");
 return{mission,title,summary,payload,status};
}
async function perform(code){
 let runId=null;
 try {
  const registry=await rest("fast_agent_registry?agent_code=eq."+encodeURIComponent(code)+"&select=agent_code,status,config&limit=1");
  if(!registry.data?.length||registry.data[0].status!=="active")return{agent:code,status:"not_active"};
  const x=await rest("fast_agent_runs",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({agent_code:code,trigger_source:"org_runtime",status:"running"})});
  runId=x.data?.[0]?.id; if(!runId)throw Error("Failed to create run");
  const m=await buildMission(code);
  const now=new Date(),key=now.toISOString().slice(0,10);
  await rest("fast_org_deliverables?on_conflict=agent_code,mission,period_key",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({agent_code:code,mission:m.mission,period_key:key,title:m.title,summary:m.summary,payload:m.payload,status:m.status,updated_at:now.toISOString()})});
  const verify={read_only:true,executed_mission:m.mission,report_saved:true,no_delete_capability:true,no_external_publication:true,external_accounts_connected:false};
  await rest("fast_agent_runs?id=eq."+encodeURIComponent(runId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"completed",finished_at:now.toISOString(),observations:{summary:m.summary},decisions:[{action:"internal_report",mission:m.mission,status:m.status}],verification:verify})});
  await rest("fast_agent_registry?agent_code=eq."+encodeURIComponent(code),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({last_seen_at:now.toISOString(),updated_at:now.toISOString()})});
  return{agent:code,status:"completed",mission:m.mission,report_status:m.status};
 }catch(e){
  const message=String(e instanceof Error?e.message:e).slice(0,200);
  if(runId)try{await rest("fast_agent_runs?id=eq."+encodeURIComponent(runId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"failed",finished_at:new Date().toISOString(),error:message})});}catch{}
  return{agent:code,status:"failed",error:message};
 }
}
function due(code,now){
 const min=now.getUTCMinutes(),hour=now.getUTCHours();
 if(code==="DESIGNER_G")return true;
 if(["MAP_G","PRODUCT_G","DISPATCH_G","MAXIME_FAST"].includes(code))return min<15;
 if(["CLIENT_OPERATIONS_G","DRIVER_OPERATIONS_G"].includes(code))return min<15 &&hour%3===0;
 if(code==="ETIENNE_FAST")return min<15 && hour===7;
 if(["LEON_FAST","YAN_FAST"].includes(code))return min<15 && hour===8;
 if(["THEO_FAST","LINA_FAST","MAYA_FAST","AXEL_FAST"].includes(code))return min<15 && hour===9;
 return false;
}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return j({ok:false,error:"POST only"},405);
 try{
  if(!await auth(req))return j({ok:false,error:"Unauthorized"},401);
  const body=await req.json().catch(()=>({}));
  const all=body.force_all===true && body.trigger==="bootstrap";
  const selected=all?ALLOWED:ALLOWED.filter(c=>due(c,new Date()));
  const results=[];
  // Limit concurrency, so startup doesn't overwhelm Supabase or public web endpoints.
  for(let i=0;i<selected.length;i+=3)results.push(...await Promise.all(selected.slice(i,i+3).map(perform)));
  return j({ok:results.every(x=>x.status==="completed"),count:selected.length,results});
 }catch(e){return j({ok:false,error:String(e instanceof Error?e.message:e).slice(0,220)},500);}
});
