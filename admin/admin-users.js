(()=>{
'use strict';
const API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-users';
const AUTH_API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-api';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString('fr-FR'):'—';
function token(){return localStorage.getItem('fast_admin_token')||''}
function toast(m){const t=$('toast');if(!t)return;t.textContent=String(m||'');t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('on'),2800)}
async function request(path){const r=await fetch(API+path,{headers:{'Content-Type':'application/json','x-fast-admin-token':token()},cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);return d}
function roleLabel(v){return({super_admin:'Super administrateur',admin:'Administrateur',analyst:'Analyste',support:'Support'})[v]||v||'—'}
function ensureRequestAccess(){
  const card=document.querySelector('#loginView .login-card');if(!card||$('requestAdminBtn'))return;
  const wrap=document.createElement('div');wrap.style.marginTop='16px';
  wrap.innerHTML=`<button id="requestAdminBtn" type="button" style="width:100%;min-height:48px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:12px;font-weight:800;cursor:pointer">Créer un compte administrateur</button><div id="requestAdminPanel" class="hidden" style="margin-top:14px;padding:16px;border:1px solid #dbe5ef;border-radius:16px;background:#f8fbff"><p style="margin:0 0 12px;color:#475569;font-size:13px;line-height:1.5">Le compte sera créé <b>en attente</b>. Il ne pourra se connecter qu'après votre validation dans Supabase en passant <code>is_active</code> à <code>true</code> dans <code>fast_admin_users</code>.</p><label>Nom affiché<input id="requestDisplayName" type="text" autocomplete="name" placeholder="Administrateur FAST"></label><label>Identifiant<input id="requestUsername" type="text" autocomplete="username" autocapitalize="none" placeholder="mon.identifiant"></label><label>Mot de passe<input id="requestPassword" type="password" autocomplete="new-password" placeholder="8 caractères minimum"></label><label>Confirmer le mot de passe<input id="requestPasswordConfirm" type="password" autocomplete="new-password" placeholder="Confirmer"></label><button id="submitAdminRequest" class="primary" type="button">Créer la demande</button><div id="requestAdminStatus" style="min-height:20px;margin-top:10px;font-size:13px" aria-live="polite"></div></div>`;
  card.appendChild(wrap);
  $('requestAdminBtn').onclick=()=>{$('requestAdminPanel').classList.toggle('hidden');$('requestAdminStatus').textContent=''};
  $('submitAdminRequest').onclick=registerRequest;
}
async function registerRequest(){
  const display_name=($('requestDisplayName').value||'').trim()||'Administrateur FAST',username=($('requestUsername').value||'').trim().toLowerCase(),password=$('requestPassword').value||'',confirm=$('requestPasswordConfirm').value||'',status=$('requestAdminStatus'),btn=$('submitAdminRequest');
  status.style.color='#b42318';status.textContent='';
  if(!username||!password){status.textContent='Renseignez un identifiant et un mot de passe.';return}
  if(password!==confirm){status.textContent='Les mots de passe ne correspondent pas.';return}
  btn.disabled=true;btn.textContent='Création…';
  try{const r=await fetch(AUTH_API+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,display_name,password}),cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);status.style.color='#067647';status.innerHTML='Compte créé. <b>Statut : en attente de validation Supabase.</b>';$('requestPassword').value='';$('requestPasswordConfirm').value=''}catch(e){status.textContent=e.message||'Création impossible.'}finally{btn.disabled=false;btn.textContent='Créer la demande'}
}
function ensureAdminPage(){
  const nav=$('nav'),main=document.querySelector('#adminView main');if(!nav||!main)return;
  if(!document.querySelector('[data-page="admins"]')){const btn=document.createElement('button');btn.type='button';btn.dataset.page='admins';btn.textContent='Administrateurs';nav.appendChild(btn)}
  if(!$('page-admins')){const section=document.createElement('section');section.id='page-admins';section.className='page';section.innerHTML=`<section class="panel data-hero"><div class="panel-head"><div><h2>Identifiants administrateur</h2><p>Les nouveaux comptes restent en attente jusqu'à leur validation dans Supabase.</p></div><span class="pill">Accès sécurisé</span></div></section><section class="panel"><div class="panel-head"><div><h2>Comptes administrateurs</h2><span><b id="adminUsersCount">0</b> compte(s)</span></div><button id="reloadAdminsBtn" class="small" type="button">Actualiser</button></div><div class="table-wrap"><table><thead><tr><th>Identifiant</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Créé le</th></tr></thead><tbody id="adminUsersBody"><tr><td colspan="5" class="muted">Chargement…</td></tr></tbody></table></div><p class="security-note" style="margin-top:14px">Validation manuelle : Supabase → Table Editor → fast_admin_users → is_active = true.</p></section>`;main.appendChild(section)}
}
function openAdminsPage(){ensureAdminPage();document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='admins'));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-admins'));if($('pageTitle'))$('pageTitle').textContent='Administrateurs';loadAdmins()}
function render(rows){const body=$('adminUsersBody');if(!body)return;if($('adminUsersCount'))$('adminUsersCount').textContent=String(rows.length);body.innerHTML=rows.map(u=>`<tr><td><span class="name">${esc(u.username)}</span><span class="sub">${esc(u.display_name||'Administrateur FAST')}</span></td><td>${esc(roleLabel(u.role))}</td><td>${u.is_active?'<span class="pill ok">Actif</span>':'<span class="pill warn">En attente</span>'}</td><td>${fmt(u.last_login_at)}</td><td>${fmt(u.created_at)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Aucun compte administrateur pour le moment.</td></tr>'}
async function loadAdmins(){const body=$('adminUsersBody');if(body)body.innerHTML='<tr><td colspan="5" class="muted">Chargement…</td></tr>';try{const d=await request('/list');render(d.data||[])}catch(e){if(body)body.innerHTML='<tr><td colspan="5" class="muted">Impossible de charger les administrateurs.</td></tr>';toast(e.message)}}
function bind(){ensureRequestAccess();ensureAdminPage();const btn=document.querySelector('[data-page="admins"]');if(btn&&!btn.dataset.adminUsersBound){btn.dataset.adminUsersBound='1';btn.addEventListener('click',openAdminsPage)}const reload=$('reloadAdminsBtn');if(reload&&!reload.dataset.adminUsersBound){reload.dataset.adminUsersBound='1';reload.addEventListener('click',loadAdmins)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
