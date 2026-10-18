(()=>{
'use strict';
const API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-api';
const $=id=>document.getElementById(id);
const date=v=>v?new Date(v).toLocaleString('fr-FR'):'—';
function cell(row,value){const td=document.createElement('td');td.textContent=String(value??'—');row.appendChild(td)}
function bodyRows(id,rows){const body=$(id);if(!body)return;body.replaceChildren();for(const cells of rows){const tr=document.createElement('tr');for(const text of cells)cell(tr,text);body.appendChild(tr)}if(!rows.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=6;td.textContent='Aucun dossier à afficher.';tr.appendChild(td);body.appendChild(tr)}}
let busy=false;
async function load(){
 if(busy)return;const summary=$('fastWorkflowsSummary');if(!summary)return;
 const token=localStorage.getItem('fast_admin_token');if(!token){summary.textContent='Connexion administrateur requise.';return}
 busy=true;summary.textContent='Chargement du suivi des comptes et chauffeurs…';
 try{
  const r=await fetch(API+'/business-workflows',{method:'GET',headers:{'x-fast-admin-token':token,'Accept':'application/json'},cache:'no-store'});
  const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Accès non autorisé');
  const all=data.items||[],open=all.filter(x=>x.status==='open');
  const driver=open.filter(x=>x.workflow==='driver').length;
  const docs=open.filter(x=>x.workflow==='document').length;
  const clients=open.filter(x=>x.workflow==='client').length;
  summary.textContent='Dossiers actifs : '+open.length+' | Chauffeurs : '+driver+' | Documents : '+docs+' | Clients : '+clients+'. Aucune approbation de permis ou d’identité par l’IA.';
  bodyRows('fastWorkflowsBody',all.slice(0,100).map(x=>[
   x.workflow==='driver'?'Chauffeur':x.workflow==='client'?'Client':'Document',
   (x.reason_codes||[]).join(', '),x.priority,x.status,
   x.human_review_required?'Oui':'Non',date(x.last_seen_at)
  ]));
  bodyRows('fastWorkflowsRuns',(data.runs||[]).slice(0,30).map(x=>[
   x.workflow,x.status,date(x.executed_at),
   Object.entries(x.result||{}).map(([key,val])=>key+' : '+String(val)).join(' · ')
  ]));
 }catch(e){summary.textContent='Impossible de charger les workflows : '+String(e?.message||e)}
 finally{busy=false}
}
document.querySelector('#nav button[data-page="workflows"]')?.addEventListener('click',load);
$('fastWorkflowsRefresh')?.addEventListener('click',load);
})();