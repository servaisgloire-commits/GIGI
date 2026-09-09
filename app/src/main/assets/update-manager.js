(()=>{
'use strict';
const UPDATE_MANIFEST='https://raw.githubusercontent.com/servaisgloire-commits/GIGI/main/updates/latest.json';
const CHECK_INTERVAL_MS=6*60*60*1000;
let lastCheck=0,lastManifest=null,updateBusy=false;
const u$=id=>document.getElementById(id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function downloadUrl(manifest){
  try{const url=new URL(String(manifest?.url||''));return url.protocol==='https:'&&url.hostname==='github.com'&&url.pathname.startsWith('/servaisgloire-commits/GIGI/releases/download/')&&url.pathname.endsWith('.apk')&&!url.username&&!url.password?url.href:''}catch(e){return ''}
}
function downloadApk(){
  const url=downloadUrl(lastManifest);
  if(!url){setUpdateMessage('Vérifiez les mises à jour pour obtenir le lien de téléchargement.');return}
  openExternal(url);
  setUpdateMessage('Téléchargement ouvert dans votre navigateur. Une fois terminé, ouvrez l’APK pour l’installer.');
}
function refreshDownloadButton(){
  const button=u$('fastDownloadUpdateBtn');if(!button)return;
  button.disabled=!downloadUrl(lastManifest);
  button.textContent=lastManifest?`Télécharger l’APK • ${lastManifest.version||'FAST'}`:'Télécharger l’APK';
}
function currentVersion(){try{return String(FASTNative.appVersion()||'0')}catch(e){return '0'}}
function currentBuild(){try{return Number(FASTNative.appBuildCode()||0)}catch(e){return 0}}
function isDebug(){try{return Boolean(FASTNative.isDebugBuild())}catch(e){return false}}
function openExternal(url){if(!url)return;try{FASTNative.openExternalUrl(String(url));return}catch(e){}try{window.open(url,'_blank')}catch(e){location.href=url}}
function ensureUpdateEntry(){
  const profile=u$('profilePage');if(!profile||u$('fastUpdateCard'))return;
  const card=document.createElement('div');card.id='fastUpdateCard';card.className='card-lite';
  card.innerHTML=`<b>Mises à jour FAST</b><p id="fastUpdateStatus" role="status">Version ${currentVersion()} • build ${currentBuild()}</p><button id="fastCheckUpdateBtn" class="btn outline" type="button">Vérifier les mises à jour</button><button id="fastDownloadUpdateBtn" class="btn" style="margin-top:10px" type="button" disabled>Télécharger l’APK</button><p class="help">Téléchargement direct du fichier Android. Ouvrez ensuite l’APK pour installer FAST.</p>`;
  const logout=u$('logoutBtn');if(logout)profile.insertBefore(card,logout);else profile.appendChild(card);
  u$('fastCheckUpdateBtn').onclick=()=>checkForUpdates(true);
  u$('fastDownloadUpdateBtn').onclick=downloadApk;
  refreshDownloadButton();
}
function closeSheet(){if(!updateBusy)u$('fastUpdateSheet')?.remove()}
function setUpdateMessage(message){const status=u$('fastUpdateStatus');if(status)status.textContent=message;const live=u$('fastUpdateLive');if(live)live.textContent=message}
function startNativeInstall(manifest){
  const url=downloadUrl(manifest);if(!url)return setUpdateMessage('Lien de mise à jour indisponible');
  try{
    if(typeof FASTNative!=='undefined'&&typeof FASTNative.installUpdate==='function'){
      const started=FASTNative.installUpdate(url);
      if(started!==false){updateBusy=true;setUpdateMessage(isDebug()?'Installation de FAST Production…':'Préparation de la mise à jour…');const btn=u$('fastUpdateNow');if(btn){btn.disabled=true;btn.textContent='Préparation…'}return}
    }
  }catch(e){}
  openExternal(url);
}
function showUpdate(manifest){
  if(u$('fastUpdateSheet'))return;
  const mandatory=Boolean(manifest.mandatory)||currentBuild()<Number(manifest.minimumBuild||0);
  const sheet=document.createElement('div');sheet.id='fastUpdateSheet';
  sheet.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(8,18,35,.58);display:flex;align-items:flex-end;justify-content:center;padding:18px';
  sheet.innerHTML=`<div style="width:min(100%,560px);background:#fff;border-radius:28px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.28)"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div style="width:44px;height:44px;border-radius:14px;background:#0b57d0;color:#fff;display:grid;place-items:center;font-size:24px">↻</div><div><small style="color:#667085">MISE À JOUR FAST</small><h3 style="margin:2px 0 0;color:#101828;font-size:22px">Version ${escapeHtml(manifest.version||'nouvelle')} disponible</h3></div></div><p style="margin:0 0 10px;color:#667085;line-height:1.45">${escapeHtml(manifest.notes||'Une nouvelle version de FAST est disponible.')}</p>${isDebug()?'<p style="margin:0 0 12px;color:#9a6700;font-size:12px">Vous utilisez une version de test. FAST Production sera installée pour permettre les prochaines mises à jour automatiques.</p>':''}<p id="fastUpdateLive" style="margin:0 0 18px;color:#0b57d0;font-size:12px;font-weight:800">Prêt à installer</p><div style="display:grid;grid-template-columns:${mandatory?'1fr':'1fr 1fr'};gap:12px">${mandatory?'':'<button id="fastUpdateLater" type="button" class="btn outline">Plus tard</button>'}<button id="fastUpdateNow" type="button" class="btn">Mettre à jour</button></div>${mandatory?'<p style="margin:12px 0 0;color:#b42318;font-size:13px">Cette mise à jour est nécessaire pour continuer à utiliser FAST dans de bonnes conditions.</p>':''}</div>`;
  document.body.appendChild(sheet);
  // Keep a direct APK download available alongside native installation.
  const direct=document.createElement('button');direct.id='fastDownloadUpdateSheet';direct.type='button';direct.className='btn outline';direct.style.marginTop='12px';direct.textContent='Télécharger l’APK uniquement';direct.onclick=downloadApk;sheet.firstElementChild.appendChild(direct);
  const later=u$('fastUpdateLater');if(later)later.onclick=closeSheet;
  u$('fastUpdateNow').onclick=()=>startNativeInstall(manifest);
  if(!mandatory)sheet.onclick=e=>{if(e.target===sheet)closeSheet()};
}
async function fetchManifest(){const r=await fetch(UPDATE_MANIFEST+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('update_manifest_http_'+r.status);return r.json()}
async function checkForUpdates(force=false){
  const now=Date.now();if(!force&&now-lastCheck<CHECK_INTERVAL_MS)return;lastCheck=now;ensureUpdateEntry();const status=u$('fastUpdateStatus');if(force&&status)status.textContent='Recherche d’une mise à jour…';
  try{const m=await fetchManifest();if(!downloadUrl(m))throw new Error('invalid_update_url');lastManifest=m;refreshDownloadButton();const local=currentBuild(),remote=Number(m.build||0),available=remote>local;if(status)status.textContent=available?`Mise à jour disponible • ${m.version||''} build ${remote}`:`FAST est à jour • ${currentVersion()} build ${local}`;if(available)showUpdate(m);else if(force&&typeof toast==='function')toast('FAST est à jour')}catch(e){if(status)status.textContent=`Version ${currentVersion()} • build ${currentBuild()}`;if(force&&typeof toast==='function')toast('Vérification impossible pour le moment')}
}
window.addEventListener('fast:update-status',e=>{
  const state=e.detail?.state||'',message=e.detail?.message||'Mise à jour FAST';setUpdateMessage(message);
  const btn=u$('fastUpdateNow');
  if(state==='permission'){updateBusy=true;if(btn){btn.disabled=true;btn.textContent='Autorisez puis revenez à FAST'}}
  else if(state==='downloading'){updateBusy=true;if(btn){btn.disabled=true;btn.textContent='Téléchargement…'}}
  else if(state==='downloaded'){updateBusy=true;if(btn){btn.disabled=true;btn.textContent='Ouverture Android…'}}
  else if(state==='error'){updateBusy=false;if(btn){btn.disabled=false;btn.textContent='Réessayer'}if(typeof toast==='function')toast(message)}
});
window.FASTUpdates={check:()=>checkForUpdates(true),manifest:()=>lastManifest};
window.addEventListener('load',()=>{ensureUpdateEntry();setTimeout(()=>checkForUpdates(false),1800)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){ensureUpdateEntry();checkForUpdates(false)}});
})();
