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
function ensureAdminPage(){
  const nav=$('nav');const main=document.querySelector('#adminView main');if(!nav||!main)return;
  if(!document.querySelector('[data-page="admins"]')){
    const btn=document.createElement('button');btn.type='button';btn.dataset.page='admins';btn.textContent='Administrateurs';nav.appendChild(btn);
    btn.addEventListener('click',openAdminsPage);
  }
  if(!$('page-admins')){
    const section=document.createElement('section');section.id='page-admins';section.className='page';
    section.innerHTML=`<section class="panel data-hero"><div class="panel-head"><div><h2>Identifiants administrateur</h2><p>Gestion centralisée des comptes autorisés à accéder à FAST Administration. Les mots de passe ne sont jamais affichés dans cette interface.</p></div><span class="pill">Accès sécurisé</span></div></section><section class="panel"><div class="panel-head"><div><h2>Comptes administrateurs</h2><span><b id="adminUsersCount">0</b> compte(s) dans la nouvelle table</span></div><button id="reloadAdminsBtn" class="small" type="button">Actualiser</button></div><div class="table-wrap"><table><thead><tr><th>Identifiant</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Créé le</th></tr></thead><tbody id="adminUsersBody"><tr><td colspan="5" class="muted">Chargement des administrateurs…</td></tr></tbody></table></div><p class="security-note" style="margin-top:14px">Les champs de sécurité de la base (empreinte et sel) sont accessibles uniquement au serveur FAST.</p></section>`;
    main.appendChild(section);
    $('reloadAdminsBtn')?.addEventListener('click',loadAdmins);
  }
}
function openAdminsPage(){
  ensureAdminPage();
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='admins'));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-admins'));
  if($('pageTitle'))$('pageTitle').textContent='Administrateurs';
  if($('globalSearch'))$('globalSearch').value='';
  loadAdmins();
}
function render(rows){
  const body=$('adminUsersBody');if(!body)return;
  $('adminUsersCount').textContent=String(rows.length);
  body.innerHTML=rows.map(u=>`<tr><td><span class="name">${esc(u.username)}</span><span class="sub">${esc(u.display_name||'Administrateur FAST')}</span></td><td>${esc(roleLabel(u.role))}</td><td>${u.is_active?'<span class="pill ok">Actif</span>':'<span class="pill bad">Désactivé</span>'}</td><td>${fmt(u.last_login_at)}</td><td>${fmt(u.created_at)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">La table est prête. Aucun nouvel identifiant administrateur n’y est encore enregistré.</td></tr>';
}
async function loadAdmins(){
  const body=$('adminUsersBody');if(body)body.innerHTML='<tr><td colspan="5" class="muted">Chargement des administrateurs…</td></tr>';
  try{const d=await request('/list');render(d.data||[])}catch(e){if(body)body.innerHTML='<tr><td colspan="5" class="muted">Impossible de charger les administrateurs.</td></tr>';toast(e.message)}
}
function bind(){ensureAdminPage()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
