const URL=Deno.env.get("SUPABASE_URL")||"";
function service(){try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}}
const KEY=service(); const E=new TextEncoder();
const res=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
async function hash(s){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",E.encode(s))),b=>b.toString(16).padStart(2,"0")).join("")}
function equal(a,b){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function db(path,init={}){const h=new Headers(init.headers||{});h.set("apikey",KEY);if(!KEY.startsWith("sb_secret_"))h.set("authorization","Bearer "+KEY);if(!h.has("content-type"))h.set("content-type","application/json");const r=await fetch(URL+"/rest/v1/"+path,{...init,headers:h});const t=await r.text();let j;try{j=t?JSON.parse(t):null}catch{j=t}if(!r.ok)throw Error("REST "+r.status+" "+String(j?.message||"").slice(0,100));return j}
const routes=[
[/audit|indépendan|vérification générale/i,"ETIENNE_FAST"],
[/conformit|contrôle interne|respect des règles/i,"MAXIME_FAST"],
[/cyber|sécurit|intrusion|vulnérabilit/i,"SECURITY_G"],
[/administr|back.?office|dashboard/i,"G_FAST_ADMIN"],
[/message|notification|communication/i,"COMMUNICATION_G"],
[/design|interface|ux|bouton|visuel/i,"DESIGNER_G"],
[/carte|gps|itinérair|adresse|maps/i,"MAP_G"],
[/chauffeur|conducteur|véhicule/i,"DRIVER_OPERATIONS_G"],
[/dispatch|course|trajet|réservation/i,"DISPATCH_G"],
[/client|passager/i,"CLIENT_OPERATIONS_G"],
[/page.*(facebook|instagram|tiktok)|compte social/i,"THEO_FAST"],
[/contenu|visuel social|rédaction/i,"LINA_FAST"],
[/communaut|commentaire/i,"MAYA_FAST"],
[/croissance|acquisition|kpi/i,"AXEL_FAST"],
[/réseaux sociaux/i,"YAN_FAST"],
[/marketing|campagne|publicit/i,"LEON_FAST"],
[/produit|exploitation|site web/i,"PRODUCT_G"]
];
function choose(order,available){const direct=String(order.requested_agent_code||"");if(direct&&available.has(direct))return direct;for(const [re,code] of routes){if(re.test(order.order_text))return code;}return null}
function chain(code,registry){const chain=["AGENT_G"];let c=code;const seen=new Set(chain);const steps=[];
while(c&&!seen.has(c)){seen.add(c);steps.unshift(c);c=String(registry.get(c)?.config?.reports_to||"");if(c==="OWNER")break;if(steps.length>8)break}
return [...chain,...steps.filter(x=>x!=="AGENT_G")]}
Deno.serve(async req=>{
 if(req.method!=="POST")return res({ok:false,error:"POST required"},405);
 try{const token=req.headers.get("x-agent-token")||"";if(!token||token.length>512)return res({ok:false,error:"Unauthorized"},401);
 const a=await db("fast_agent_registry?agent_code=eq.AGENT_G&select=token_hash,status&limit=1");if(a?.[0]?.status!=="active"||!equal(String(a[0].token_hash||""),await hash(token)))return res({ok:false,error:"Unauthorized"},401);
 const [orders,agents]=await Promise.all([
  db("fast_director_orders?status=eq.received&select=id,order_text,requested_agent_code,priority,source,sender_email&order=created_at.asc&limit=12"),
  db("fast_agent_registry?status=eq.active&select=agent_code,display_name,config")
 ]);
 const registry=new Map((agents||[]).map(x=>[x.agent_code,x]));const results=[];
 for(const order of orders||[]){
  const target=choose(order,registry);const restricted=/\b(delete|truncate|drop table|purge|supprimer|effacer définitivement|détruire les données)\b/i.test(String(order.order_text));
  if(restricted){await db("fast_director_orders?id=eq."+order.id,{method:"PATCH",body:JSON.stringify({status:"rejected",handled_at:new Date().toISOString(),result:{reason:"Data removal is forbidden",director:"AGENT_G"}})});results.push({order:order.id,status:"rejected"});continue;}
  if(!target){await db("fast_director_orders?id=eq."+order.id,{method:"PATCH",body:JSON.stringify({status:"needs_review",handled_at:new Date().toISOString(),result:{reason:"Director requires a specific department",director:"AGENT_G"}})});results.push({order:order.id,status:"needs_review"});continue;}
  const reportingChain=chain(target,registry);
  const directive={order_id:order.id,issued_by:"AGENT_G",target_agent_code:target,chain:reportingChain,directive:String(order.order_text).slice(0,6000),requires_approval:true,status:"queued"};
  await db("fast_director_directives?on_conflict=order_id,target_agent_code",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(directive)});
  // Deliver the same instruction into the target agent's operational task queue.
  const dedupe="fast:director:"+order.id;
  const prior=await db("fast_agent_tasks?dedupe_key=eq."+encodeURIComponent(dedupe)+"&select=id&limit=1");
  if(!prior?.length) await db("fast_agent_tasks",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({
    agent_code:target,kind:"director_instruction",dedupe_key:dedupe,priority:order.priority,status:"queued",
    payload:{instruction:String(order.order_text).slice(0,6000),director:"AGENT_G",chain:reportingChain,
      requires_approval:true,reference_order_id:order.id,no_delete:true,production_changes_require_owner_approval:true}
  })});
  await db("fast_director_orders?id=eq."+order.id,{method:"PATCH",body:JSON.stringify({status:"dispatched",handled_at:new Date().toISOString(),result:{director:"AGENT_G",assigned_to:target,chain:reportingChain,requires_approval:true}})});
  results.push({order:order.id,status:"dispatched",assigned_to:target,chain:reportingChain});
 }
 return res({ok:true,processed:results.length,results});
 }catch(e){return res({ok:false,error:String(e instanceof Error?e.message:e).slice(0,180)},500)}
});
