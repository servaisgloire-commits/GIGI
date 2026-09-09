(()=>{
'use strict';
const API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-users';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString('fr-FR'):'—';
function token(){return localStorage.getItem('fast_admin_token')||''}
function toast(m){const t=$('toast');if(!t)return;t.textContent=String(m||'');t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('on'),2800)}
async function request(path){
  const r=await fetch(API+path,{headers:{'Content-Type':'application/json','x-fast-admin-token':token()},cache:'no-store'});
  let d={};try{d=await r.json()}catch{}
  if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
function roleLabel(v){return({super_admin:'Super administrateur',admin:'Administrateur',analyst:'Analyste',support:'Support'})[v]||v||'—'}
function render(rows){
  const body=$('adminUsersBody');if(!body)return;
  $('adminUsersCount').textContent=String(rows.length);
  body.innerHTML=rows.map(u=>`<tr><td><span class="name">${esc(u.username)}</span><span class="sub">${esc(u.display_name||'Administrateur FAST')}</span></td><td>${esc(roleLabel(u.role))}</td><td>${u.is_active?'<span class="pill ok">Actif</span>':'<span class="pill bad">Désactivé</span>'}</td><td>${fmt(u.last_login_at)}</td><td>${fmt(u.created_at)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Aucun identifiant administrateur enregistré dans la nouvelle table.</td></tr>';
}
async function loadAdmins(){
  const body=$('adminUsersBody');if(body)body.innerHTML='<tr><td colspan="5" class="muted">Chargement des administrateurs…</td></tr>';
  try{const d=await request('/list');render(d.data||[])}catch(e){if(body)body.innerHTML='<tr><td colspan="5" class="muted">Impossible de charger les administrateurs.</td></tr>';toast(e.message)}
}
function bind(){
  document.querySelector('[data-page="admins"]')?.addEventListener('click',()=>setTimeout(()=>{if($('pageTitle'))$('pageTitle').textContent='Administrateurs';loadAdmins()},0));
  $('reloadAdminsBtn')?.addEventListener('click',loadAdmins);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
