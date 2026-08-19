(()=>{
'use strict';
const UPDATE_MANIFEST='https://raw.githubusercontent.com/servaisgloire-commits/GIGI/main/updates/latest.json';
const CHECK_INTERVAL_MS=6*60*60*1000;
let lastCheck=0,lastManifest=null;
const u$=id=>document.getElementById(id);
function currentVersion(){try{return String(FASTNative.appVersion()||'0')}catch(e){return '0'}}
function currentBuild(){try{return Number(FASTNative.appBuildCode()||0)}catch(e){return 0}}
function openExternal(url){if(!url)return;try{FASTNative.openExternalUrl(String(url));return}catch(e){} try{window.open(url,'_blank')}catch(e){location.href=url}}
function ensureUpdateEntry(){
  const profile=u$('profilePage');if(!profile||u$('fastUpdateCard'))return;
  const card=document.createElement('div');card.id='fastUpdateCard';card.className='card-lite';
  card.innerHTML=`<b>Mises à jour FAST</b><p id="fastUpdateStatus">Version ${currentVersion()} • build ${currentBuild()}</p><button id="fastCheckUpdateBtn" class="btn outline" type="button">Vérifier les mises à jour</button>`;
  const logout=u$('logoutBtn');if(logout)profile.insertBefore(card,logout);else profile.appendChild(card);
  u$('fastCheckUpdateBtn').onclick=()=>checkForUpdates(true);
}
function closeSheet(){u$('fastUpdateSheet')?.remove()}
function showUpdate(manifest){
  closeSheet();
  const mandatory=Boolean(manifest.mandatory)||currentBuild()<Number(manifest.minimumBuild||0);
  const sheet=document.createElement('div');sheet.id='fastUpdateSheet';
  sheet.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(8,18,35,.58);display:flex;align-items:flex-end;justify-content:center;padding:18px';
  sheet.innerHTML=`<div style="width:min(100%,560px);background:#fff;border-radius:28px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.28)"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div style="width:44px;height:44px;border-radius:14px;background:#0b57d0;color:#fff;display:grid;place-items:center;font-size:24px">↻</div><div><small style="color:#667085">MISE À JOUR FAST</small><h3 style="margin:2px 0 0;color:#101828;font-size:22px">Version ${manifest.version||'nouvelle'} disponible</h3></div></div><p style="margin:0 0 18px;color:#667085;line-height:1.45">${String(manifest.notes||'Une nouvelle version de FAST est disponible.')}</p><div style="display:grid;grid-template-columns:${mandatory?'1fr':'1fr 1fr'};gap:12px">${mandatory?'':'<button id="fastUpdateLater" type="button" class="btn outline">Plus tard</button>'}<button id="fastUpdateNow" type="button" class="btn">Mettre à jour</button></div>${mandatory?'<p style="margin:12px 0 0;color:#b42318;font-size:13px">Cette mise à jour est nécessaire pour continuer à utiliser FAST dans de bonnes conditions.</p>':''}</div>`;
  document.body.appendChild(sheet);
  const later=u$('fastUpdateLater');if(later)later.onclick=closeSheet;
  u$('fastUpdateNow').onclick=()=>openExternal(manifest.url);
  if(!mandatory)sheet.onclick=e=>{if(e.target===sheet)closeSheet()};
}
async function fetchManifest(){
  const r=await fetch(UPDATE_MANIFEST+'?t='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('update_manifest_http_'+r.status);
  return r.json();
}
async function checkForUpdates(force=false){
  const now=Date.now();if(!force&&now-lastCheck<CHECK_INTERVAL_MS)return;
  lastCheck=now;ensureUpdateEntry();
  const status=u$('fastUpdateStatus');if(force&&status)status.textContent='Recherche d’une mise à jour…';
  try{
    const m=await fetchManifest();lastManifest=m;
    const local=currentBuild(),remote=Number(m.build||0),available=remote>local;
    if(status)status.textContent=available?`Mise à jour disponible • ${m.version||''} build ${remote}`:`FAST est à jour • ${currentVersion()} build ${local}`;
    if(available)showUpdate(m);else if(force&&typeof toast==='function')toast('FAST est à jour');
  }catch(e){
    if(status)status.textContent=`Version ${currentVersion()} • build ${currentBuild()}`;
    if(force&&typeof toast==='function')toast('Vérification impossible pour le moment');
  }
}
window.FASTUpdates={check:()=>checkForUpdates(true),manifest:()=>lastManifest};
window.addEventListener('load',()=>{ensureUpdateEntry();setTimeout(()=>checkForUpdates(false),1800)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){ensureUpdateEntry();checkForUpdates(false)}});
})();
