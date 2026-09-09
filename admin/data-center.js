(()=>{
'use strict';
const DATA_API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-data';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>v?new Date(v).toLocaleString('fr-FR'):'—';
let selectedFile=null;
let parsedData=null;
let datasets=[];

function token(){return localStorage.getItem('fast_admin_token')||''}
function toast(message){const t=$('toast');if(!t)return;t.textContent=String(message||'');t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('on'),3000)}
function showModal(title,html){if(!$('modal'))return;$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.remove('hidden')}
async function dataRequest(path,opts={}){
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  const t=token();if(t)headers['x-fast-admin-token']=t;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch(DATA_API+path,{...opts,headers,signal:opts.signal||controller.signal,cache:'no-store'});
    let d={};try{d=await r.json()}catch{}
    if(r.status===401)throw new Error('Session expirée. Reconnectez-vous.');
    if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);
    return d;
  }catch(e){if(e?.name==='AbortError')throw new Error('Délai réseau dépassé.');throw e}finally{clearTimeout(timer)}
}

function installWorkspaceChrome(){
  const top=$('pageTitle')?.closest('.topbar');
  if(top&&!$('globalSearch')){
    const box=document.createElement('div');box.className='workspace-search';box.innerHTML='<span>⌕</span><input id="globalSearch" type="search" placeholder="Rechercher dans la page..."><kbd>Ctrl K</kbd>';
    top.insertBefore(box,top.querySelector('.top-actions'));
    $('globalSearch').addEventListener('input',filterCurrentTable);
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('globalSearch')?.focus()}});
  }
  const actions=top?.querySelector('.top-actions');
  if(actions&&!$('syncStatus')){
    const pill=document.createElement('span');pill.id='syncStatus';pill.className='sync-pill checking';pill.innerHTML='<i></i><span>Base en vérification</span>';
    actions.prepend(pill);
  }
}
function filterCurrentTable(){
  const q=($('globalSearch')?.value||'').trim().toLowerCase();
  const page=document.querySelector('.page.active');if(!page)return;
  page.querySelectorAll('tbody tr').forEach(tr=>{tr.style.display=!q||tr.textContent.toLowerCase().includes(q)?'':'none'});
}
function setConnectionState(ok){
  const p=$('syncStatus');if(!p)return;p.classList.toggle('ok',ok);p.classList.toggle('bad',!ok);p.classList.remove('checking');p.querySelector('span').textContent=ok?'Base synchronisée':'Connexion à vérifier';
}

async function loadConnections(){
  try{
    const d=await dataRequest('/connections');const c=d.data||{};setConnectionState(true);
    if($('dbStatus'))$('dbStatus').innerHTML='<span class="conn-dot ok"></span><div><b>Supabase PostgreSQL</b><small>Connecté • projet The Fast N°1</small></div><span class="pill ok">Actif</span>';
    if($('sqlStatus'))$('sqlStatus').innerHTML='<span class="conn-dot ok"></span><div><b>SQL / PostgreSQL</b><small>Schéma analytics prêt pour les requêtes</small></div><span class="pill ok">Prêt</span>';
    if($('pbiStatus'))$('pbiStatus').innerHTML='<span class="conn-dot warn"></span><div><b>Microsoft Power BI</b><small>Connecteur PostgreSQL préparé, espace Power BI non configuré</small></div><span class="pill warn">À configurer</span>';
    if($('connectionDetail'))$('connectionDetail').innerHTML=`<div><span>Moteur</span><b>${esc(c.database?.engine||'PostgreSQL')}</b></div><div><span>Schéma analytique</span><b>${esc(c.sql?.schema||'analytics')}</b></div><div><span>Vue imports</span><b>${esc(c.import?.flattened_view||'public.fast_admin_dataset_rows')}</b></div><div><span>Formats import</span><b>${esc((c.import?.formats||[]).join(', ').toUpperCase())}</b></div>`;
  }catch(e){setConnectionState(false);toast(e.message)}
}

function parseWorkbook(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Impossible de lire le fichier.'));
    reader.onload=()=>{
      try{
        if(!window.XLSX)throw new Error('Le module Excel n’est pas disponible.');
        const wb=XLSX.read(reader.result,{type:'array',cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw new Error('Aucune feuille trouvée.');
        const grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:false,blankrows:false});
        if(!grid.length)throw new Error('Le fichier est vide.');
        const headers=(grid.shift()||[]).map((v,i)=>String(v??'').trim()||`Colonne ${i+1}`);
        const rows=grid.filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()!==''));
        if(headers.length>200)throw new Error('Le fichier contient trop de colonnes (maximum 200).');
        if(rows.length>5000)throw new Error('Cette version accepte jusqu’à 5 000 lignes par import.');
        resolve({headers,rows});
      }catch(e){reject(e)}
    };
    reader.readAsArrayBuffer(file);
  });
}
function renderPreview(){
  const box=$('dataPreview');if(!box)return;
  if(!parsedData){box.innerHTML='<div class="empty-state"><b>Aucun fichier sélectionné</b><span>CSV, XLSX ou XLS • jusqu’à 5 000 lignes</span></div>';return}
  const {headers,rows}=parsedData;const sample=rows.slice(0,8);
  box.innerHTML=`<div class="preview-meta"><div><b>${esc(selectedFile?.name||'Fichier')}</b><span>${rows.length.toLocaleString('fr-FR')} lignes • ${headers.length} colonnes</span></div><span class="pill blue">Aperçu</span></div><div class="table-wrap compact"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sample.map(r=>`<tr>${headers.map((_,i)=>`<td>${esc(r[i]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
async function onFileSelected(file){
  selectedFile=file||null;parsedData=null;const btn=$('importDataBtn');if(btn)btn.disabled=true;
  if(!file){renderPreview();return}
  if(file.size>8*1024*1024){toast('Fichier trop volumineux : maximum 8 Mo.');$('dataFile').value='';selectedFile=null;renderPreview();return}
  const ext=(file.name.split('.').pop()||'').toLowerCase();if(!['csv','xlsx','xls'].includes(ext)){toast('Format accepté : CSV, XLSX ou XLS.');$('dataFile').value='';selectedFile=null;renderPreview();return}
  try{parsedData=await parseWorkbook(file);renderPreview();if(btn)btn.disabled=false}catch(e){toast(e.message);renderPreview()}
}
async function importData(){
  if(!selectedFile||!parsedData)return;
  const btn=$('importDataBtn');btn.disabled=true;const old=btn.textContent;btn.textContent='Transfert en cours…';
  try{
    const ext=(selectedFile.name.split('.').pop()||'csv').toLowerCase();
    const name=selectedFile.name.replace(/\.[^.]+$/,'');
    const d=await dataRequest('/dataset/import',{method:'POST',body:JSON.stringify({name,original_name:selectedFile.name,file_size:selectedFile.size,source_type:ext,headers:parsedData.headers,rows:parsedData.rows})});
    toast(d.duplicate?'Ce fichier existe déjà dans la base.':`${parsedData.rows.length} lignes transférées dans la base.`);
    if(!d.duplicate){selectedFile=null;parsedData=null;$('dataFile').value='';renderPreview()}
    await loadDatasets();
  }catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent=old}
}

async function loadDatasets(){
  try{const d=await dataRequest('/datasets');datasets=d.data||[];renderDatasets()}catch(e){toast(e.message)}
}
function renderDatasets(){
  const body=$('datasetsBody');if(!body)return;
  const total=datasets.reduce((s,d)=>s+Number(d.row_count||0),0);
  if($('datasetCount'))$('datasetCount').textContent=datasets.length.toLocaleString('fr-FR');
  if($('datasetRows'))$('datasetRows').textContent=total.toLocaleString('fr-FR');
  body.innerHTML=datasets.map(d=>`<tr><td><span class="name">${esc(d.name)}</span><span class="sub">${esc(String(d.source_type||'').toUpperCase())}</span></td><td>${Number(d.row_count||0).toLocaleString('fr-FR')}</td><td>${fmtDate(d.created_at)}</td><td><span class="pill ok">En base</span></td><td><div class="row-actions"><button data-dataset-export="${d.id}">Exporter</button><button class="reject" data-dataset-delete="${d.id}">Supprimer</button></div></td></tr>`).join('')||'<tr><td colspan="5" class="muted">Aucun fichier importé.</td></tr>';
  document.querySelectorAll('[data-dataset-export]').forEach(b=>b.onclick=()=>exportDataset(b.dataset.datasetExport));
  document.querySelectorAll('[data-dataset-delete]').forEach(b=>b.onclick=()=>deleteDataset(b.dataset.datasetDelete));
}
async function exportDataset(id){
  try{
    const d=await dataRequest('/dataset?id='+encodeURIComponent(id));const x=d.data;
    const ws=XLSX.utils.aoa_to_sheet([x.headers,...x.rows]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Données');XLSX.writeFile(wb,`${x.name||'fast-data'}.xlsx`);
  }catch(e){toast(e.message)}
}
async function deleteDataset(id){
  const item=datasets.find(x=>x.id===id);if(!confirm(`Supprimer ${item?.name||'ce jeu de données'} de la base ?`))return;
  try{await dataRequest('/dataset/delete',{method:'POST',body:JSON.stringify({id})});toast('Jeu de données supprimé.');await loadDatasets()}catch(e){toast(e.message)}
}

function showPowerBiHelp(){
  showModal('Connexion Power BI',`<div class="connect-guide"><p><b>FAST est prêt pour une connexion Power BI via PostgreSQL.</b></p><ol><li>Dans Power BI Desktop, choisissez <b>Obtenir des données → PostgreSQL</b>.</li><li>Récupérez le serveur et les identifiants dans <b>Supabase → Connect</b>.</li><li>Base : <b>postgres</b>. Schéma recommandé : <b>analytics</b>.</li><li>Chargez les vues <b>fast_rides</b>, <b>fast_payments</b>, <b>fast_drivers</b> ou <b>fast_imported_rows</b>.</li></ol><p class="security-note">Aucun mot de passe de base de données n’est affiché ni stocké dans l’interface FAST.</p></div>`);
}
function showSqlHelp(){
  showModal('Accès SQL',`<div class="connect-guide"><p><b>La base FAST utilise PostgreSQL 17.</b></p><div class="code-card"><span>Schéma analytique</span><code>analytics</code><span>Imports aplatis</span><code>public.fast_admin_dataset_rows</code></div><p>Les paramètres de connexion complets se récupèrent dans l’onglet <b>Connect</b> du projet Supabase “The Fast N°1”.</p></div>`);
}

function bind(){
  installWorkspaceChrome();renderPreview();
  $('dataFile')?.addEventListener('change',e=>onFileSelected(e.target.files?.[0]));
  $('importDataBtn')?.addEventListener('click',importData);
  $('reloadDatasetsBtn')?.addEventListener('click',loadDatasets);
  $('powerBiHelpBtn')?.addEventListener('click',showPowerBiHelp);
  $('sqlHelpBtn')?.addEventListener('click',showSqlHelp);
  document.querySelector('[data-page="data"]')?.addEventListener('click',()=>{setTimeout(()=>{if($('pageTitle'))$('pageTitle').textContent='Données & connexions';loadConnections();loadDatasets()},0)});
  document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>{if($('globalSearch')){$('globalSearch').value='';filterCurrentTable()}}));
  const observer=new MutationObserver(()=>{if(!$('adminView')?.classList.contains('hidden')&&token()){loadConnections()}});
  if($('adminView'))observer.observe($('adminView'),{attributes:true,attributeFilter:['class']});
  if(token())loadConnections();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
