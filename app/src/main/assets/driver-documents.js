(()=>{
'use strict';
const $=id=>document.getElementById(id);
const DOCS=[
  ['identity','Pièce d’identité','Carte nationale, passeport ou titre reconnu'],
  ['license','Permis de conduire','Permis en cours de validité'],
  ['vehicle_registration','Carte grise','Certificat d’immatriculation du véhicule'],
  ['insurance','Assurance','Attestation d’assurance du véhicule'],
  ['driver_photo','Photo chauffeur','Photo récente et nette du chauffeur'],
  ['address_proof','Justificatif de domicile','Document récent indiquant l’adresse']
];
const STATUS={pending:['En contrôle','pending'],approved:['Validé','approved'],rejected:['Refusé','rejected']};
let latestByType=new Map(),busy=false;

function isDriver(){try{return typeof role!=='undefined'&&role==='driver'}catch{return false}}
function userId(){try{return profile?.id||''}catch{return ''}}
function authHeaders(json=true){const h={apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`};if(json)h['Content-Type']='application/json';return h}
function safeName(name){return String(name||'document').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(-90)||'document'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toastSafe(m){try{if(typeof toast==='function')toast(m)}catch{}}
function statusInfo(doc){
  if(!doc)return ['À envoyer','missing'];
  const base=STATUS[doc.status]||[doc.status||'Inconnu','pending'];
  if(doc.expires_at&&new Date(doc.expires_at+'T23:59:59')<new Date())return ['Expiré','rejected'];
  return base;
}

function css(){
  if($('fast-driver-documents-css'))return;
  const s=document.createElement('style');s.id='fast-driver-documents-css';s.textContent=`
    .fast-driver-documents{margin:14px 0 100px;background:#fff;border:1px solid #dbe5f1;border-radius:20px;padding:14px;box-shadow:0 10px 26px rgba(15,23,42,.07)}
    .fast-driver-documents .docs-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}
    .fast-driver-documents .docs-head h3{margin:0 0 4px;font-size:16px;color:#0f172a}.fast-driver-documents .docs-head p{margin:0;color:#64748b;font-size:11px;line-height:1.45}
    .fast-doc-progress{white-space:nowrap;background:#eef5ff;color:#0b57d0;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900}
    .fast-doc-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid #eef2f7}.fast-doc-row:first-of-type{border-top:0}
    .fast-doc-row b{display:block;font-size:12px;color:#172033}.fast-doc-row small{display:block;color:#718096;font-size:9px;line-height:1.4;margin-top:3px}.fast-doc-row .doc-reason{color:#b42318;margin-top:4px}
    .fast-doc-actions{display:flex;align-items:center;gap:7px}.fast-doc-status{border-radius:999px;padding:5px 7px;font-size:9px;font-weight:900;white-space:nowrap}.fast-doc-status.missing{background:#f1f5f9;color:#475569}.fast-doc-status.pending{background:#fff7e6;color:#a15c00}.fast-doc-status.approved{background:#eafaf0;color:#087a3a}.fast-doc-status.rejected{background:#fff0f0;color:#b42318}
    .fast-doc-upload{position:relative;overflow:hidden;border:0;background:#0b57d0;color:white;border-radius:10px;padding:7px 9px;font-size:9px;font-weight:900;cursor:pointer}.fast-doc-upload input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
    .fast-doc-note{margin-top:10px;background:#f8fbff;border-radius:12px;padding:9px 10px;color:#516173;font-size:9px;line-height:1.45}
    .fast-doc-overlay{position:absolute;inset:0;border-radius:20px;background:rgba(255,255,255,.8);display:grid;place-items:center;font-weight:900;color:#0b57d0;z-index:2}
  `;document.head.appendChild(s);
}

function ensure(){
  if(!isDriver())return null;
  css();
  let host=$('driverProfilePage');if(!host)return null;
  let box=$('fastDriverDocuments');
  if(!box){
    box=document.createElement('section');box.id='fastDriverDocuments';box.className='fast-driver-documents';
    const logout=host.querySelector('#driverProfileLogout')||host.querySelector('button[id*=Logout]');
    if(logout)host.insertBefore(box,logout);else host.appendChild(box);
  }
  render();return box;
}

function render(){
  const box=$('fastDriverDocuments');if(!box)return;
  let approved=0;
  const rows=DOCS.map(([type,label,desc])=>{
    const doc=latestByType.get(type),[txt,cls]=statusInfo(doc);if(cls==='approved')approved++;
    const reason=doc?.status==='rejected'&&doc?.rejection_reason?`<small class="doc-reason">Motif : ${esc(doc.rejection_reason)}</small>`:'';
    const file=doc?.file_name?`<small>${esc(doc.file_name)}${doc.expires_at?' • expire '+esc(doc.expires_at):''}</small>`:'';
    return `<div class="fast-doc-row"><div><b>${esc(label)}</b><small>${esc(desc)}</small>${file}${reason}</div><div class="fast-doc-actions"><span class="fast-doc-status ${cls}">${esc(txt)}</span><label class="fast-doc-upload">${doc?'Remplacer':'Envoyer'}<input type="file" data-fast-doc="${esc(type)}" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"></label></div></div>`;
  }).join('');
  box.innerHTML=`<div class="docs-head"><div><h3>Documents chauffeur</h3><p>Les pièces sont privées et contrôlées uniquement par l’administration FAST.</p></div><span class="fast-doc-progress">${approved}/${DOCS.length} validés</span></div>${rows}<div class="fast-doc-note">PDF ou image • 12 Mo maximum. Une nouvelle pièce remplace la version précédente pour le contrôle et repasse en attente de validation.</div>`;
  box.querySelectorAll('input[data-fast-doc]').forEach(i=>i.addEventListener('change',async()=>{const file=i.files?.[0];if(file)await upload(i.dataset.fastDoc,file);i.value=''}));
}

async function list(){
  const uid=userId();if(!uid||!token||!SUPABASE_URL)return;
  try{
    const q=new URLSearchParams({select:'id,driver_id,document_type,storage_path,file_name,status,rejection_reason,country_code,mime_type,file_size_bytes,expires_at,created_at,reviewed_at',driver_id:`eq.${uid}`,order:'created_at.desc',limit:'200'});
    const r=await fetch(`${SUPABASE_URL}/rest/v1/driver_documents?${q}`,{headers:authHeaders(false),cache:'no-store'});
    if(!r.ok)throw new Error('Lecture des documents impossible');
    const rows=await r.json();latestByType=new Map();for(const row of rows||[])if(!latestByType.has(row.document_type))latestByType.set(row.document_type,row);
    ensure();
  }catch(e){console.warn('FAST driver documents',e)}
}

async function upload(type,file){
  if(busy)return;
  const uid=userId();if(!uid)return toastSafe('Profil chauffeur indisponible');
  if(!DOCS.some(x=>x[0]===type))return toastSafe('Type de document invalide');
  const allowed=['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'];
  if(!allowed.includes(file.type))return toastSafe('Format accepté : PDF ou image');
  if(file.size>12*1024*1024)return toastSafe('Le fichier dépasse 12 Mo');
  busy=true;const box=ensure();let overlay=null;
  try{
    overlay=document.createElement('div');overlay.className='fast-doc-overlay';overlay.textContent='Envoi sécurisé…';box.style.position='relative';box.appendChild(overlay);
    const path=`${uid}/${type}/${Date.now()}-${safeName(file.name)}`;
    const up=await fetch(`${SUPABASE_URL}/storage/v1/object/driver-documents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{...authHeaders(false),'Content-Type':file.type,'x-upsert':'false'},body:file});
    if(!up.ok){let msg='';try{msg=(await up.json())?.message||''}catch{}throw new Error(msg||'Envoi du fichier impossible')}
    const country=String(profile?.country_code||'CG').toUpperCase();
    const meta={driver_id:uid,document_type:type,storage_path:path,file_name:file.name,status:'pending',rejection_reason:null,country_code:country,mime_type:file.type,file_size_bytes:file.size};
    const ins=await fetch(`${SUPABASE_URL}/rest/v1/driver_documents`,{method:'POST',headers:{...authHeaders(true),Prefer:'return=representation'},body:JSON.stringify(meta)});
    if(!ins.ok){let msg='';try{msg=(await ins.json())?.message||''}catch{}throw new Error(msg||'Enregistrement du document impossible')}
    toastSafe('Document envoyé • validation FAST en attente');await list();
  }catch(e){toastSafe(e?.message||'Erreur lors de l’envoi')}
  finally{busy=false;overlay?.remove()}
}

function boot(){if(!isDriver())return;ensure();list();setInterval(()=>{if(isDriver()&&!document.hidden)list()},30000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,900));else setTimeout(boot,900);
window.addEventListener('load',()=>setTimeout(boot,1500));
window.FASTDriverDocuments={refresh:list};
})();
