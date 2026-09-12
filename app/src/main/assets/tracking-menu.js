(()=>{
'use strict';
const tm$=id=>document.getElementById(id);
function tmToast(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function closeRoleMenu(){document.querySelector('.fast-shortcut-sheet')?.remove()}

function installRoleMenuCss(){
  if(tm$('fast-role-menu-style'))return;
  const s=document.createElement('style');s.id='fast-role-menu-style';s.textContent=`
    body.driver-mode #mainHeader #menuBtn{visibility:visible!important;display:grid!important;opacity:1!important;pointer-events:auto!important}
    .fast-shortcut-item.fast-online{background:#eefbf4!important;border-color:#c8ead7!important;color:#137a43!important}
    .fast-shortcut-item.fast-offline{background:#f8faff!important;border-color:#dce7f4!important;color:#173553!important}
  `;document.head.appendChild(s);
}

function goPassengerPage(id){
  closeRoleMenu();
  try{if(typeof showPage==='function')showPage(id)}catch(e){}
  if(id==='homePage')setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},80);
}

function newPassengerTrip(){
  closeRoleMenu();
  try{
    if(typeof currentRideId!=='undefined'&&currentRideId)return tmToast('Une course est déjà en cours');
    if(window.FASTShortcuts?.newTrip)return window.FASTShortcuts.newTrip(false);
  }catch(e){}
  goPassengerPage('homePage');
}

async function openDriverTracking(){
  closeRoleMenu();
  try{
    if(typeof role!=='undefined'&&role!=='client')return;
    if(typeof currentRideId==='undefined'||!currentRideId)return tmToast('Aucun chauffeur à suivre pour le moment');
    let status='';
    try{const d=await api('/v1/rides/'+currentRideId);status=d?.ride?.status||''}catch(e){}
    if(!['accepted','driver_arriving'].includes(status)){
      if(status==='searching')return tmToast('Le chauffeur n’est pas encore confirmé');
      if(status==='in_progress')return tmToast('La course a déjà commencé');
      return tmToast('Aucun chauffeur à suivre pour le moment');
    }
    try{if(typeof showPage==='function')showPage('homePage')}catch(e){}
    document.body.classList.add('fast-passenger-waiting-driver');
    tm$('historyPage')?.classList.add('hidden');tm$('profilePage')?.classList.add('hidden');tm$('homePage')?.classList.remove('hidden');
    setTimeout(()=>{
      try{window.FASTPassengerTracking?.refresh?.()}catch(e){}
      try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}
    },80);
  }catch(e){tmToast('Suivi chauffeur momentanément indisponible')}
}

function driverHome(){
  closeRoleMenu();
  const b=document.querySelector('#driverBottomNav [data-driver-page="home"]');
  if(b){b.click();return}
  tm$('driverProfilePage')?.classList.add('hidden');tm$('driverArea')?.classList.remove('hidden');
  setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},80);
}
function driverProfile(){
  closeRoleMenu();
  const b=document.querySelector('#driverBottomNav [data-driver-page="profile"]');
  if(b){b.click();return}
  tmToast('Profil chauffeur momentanément indisponible');
}
function driverCurrentRide(){
  closeRoleMenu();
  if(typeof currentRideId==='undefined'||!currentRideId)return tmToast('Aucune course en cours');
  driverHome();
  try{if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}catch(e){}
  setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},100);
}
async function toggleDriverAvailability(){
  closeRoleMenu();
  const toggle=tm$('driverToggleInput');if(!toggle)return tmToast('Disponibilité indisponible');
  const next=!toggle.checked;
  toggle.checked=next;
  try{
    if(typeof setDriverAvailable==='function')await setDriverAvailable(next);
    else toggle.dispatchEvent(new Event('change',{bubbles:true}));
  }catch(e){toggle.checked=!next;tmToast(e?.message||'Impossible de modifier la disponibilité')}
}
function roleLogout(){closeRoleMenu();try{if(typeof logout==='function')logout()}catch(e){}}

function shortcut(icon,title,subtitle,key,cls=''){
  return `<button type="button" class="fast-shortcut-item ${cls}" data-fast-role-shortcut="${key}"><span>${icon}</span><span><b>${title}</b><small>${subtitle}</small></span><span class="arrow">›</span></button>`;
}
function passengerMenuHtml(){
  return shortcut('⌂','Accueil','Revenir à la carte','home','primary')+
    shortcut('📍','Suivi du chauffeur','Voir son déplacement en grand','tracking')+
    shortcut('＋','Nouveau trajet','Choisir une nouvelle destination','new')+
    shortcut('▣','Mes courses','Voir l’historique','history')+
    shortcut('◉','Mon profil','Paiement et assistance','profile')+
    shortcut('↪','Se déconnecter','Fermer la session FAST','logout','danger');
}
function driverMenuHtml(){
  const online=!!tm$('driverToggleInput')?.checked;
  return shortcut('🧭','Navigation chauffeur','Revenir à la carte et aux demandes','driver-home','primary')+
    shortcut('🚕','Course en cours','Ouvrir la navigation de la course','driver-ride')+
    shortcut(online?'●':'○',online?'Passer hors ligne':'Se mettre en ligne',online?'Arrêter de recevoir des courses':'Recevoir les nouvelles courses','driver-availability',online?'fast-online':'fast-offline')+
    shortcut('◉','Mon profil chauffeur','Documents et informations de paiement','driver-profile')+
    shortcut('↪','Se déconnecter','Fermer la session chauffeur','logout','danger');
}

function openRoleMenu(){
  installRoleMenuCss();closeRoleMenu();
  const isDriver=typeof role!=='undefined'&&role==='driver';
  const sheet=document.createElement('div');sheet.className='fast-shortcut-sheet';
  sheet.innerHTML=`<div class="fast-shortcut-panel"><div class="fast-shortcut-head"><b>${isDriver?'Raccourcis chauffeur':'Raccourcis FAST'}</b><button type="button" class="fast-shortcut-close" aria-label="Fermer">×</button></div><div class="fast-shortcut-list">${isDriver?driverMenuHtml():passengerMenuHtml()}</div></div>`;
  document.body.appendChild(sheet);
  sheet.querySelector('.fast-shortcut-close').onclick=closeRoleMenu;sheet.onclick=e=>{if(e.target===sheet)closeRoleMenu()};
  const on=(key,fn)=>{const b=sheet.querySelector(`[data-fast-role-shortcut="${key}"]`);if(b)b.onclick=fn};
  if(isDriver){
    on('driver-home',driverHome);on('driver-ride',driverCurrentRide);on('driver-availability',toggleDriverAvailability);on('driver-profile',driverProfile);on('logout',roleLogout);
  }else{
    on('home',()=>goPassengerPage('homePage'));on('tracking',openDriverTracking);on('new',newPassengerTrip);on('history',()=>goPassengerPage('historyPage'));on('profile',()=>goPassengerPage('profilePage'));on('logout',roleLogout);
  }
}

/* Le gestionnaire en capture empêche l'ancien menu générique de s'ouvrir en parallèle. */
document.addEventListener('click',e=>{
  const btn=e.target?.closest?.('#menuBtn');if(!btn)return;
  e.preventDefault();e.stopImmediatePropagation();openRoleMenu();
},true);
window.addEventListener('load',()=>setTimeout(installRoleMenuCss,300));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')installRoleMenuCss()});
window.FASTTrackingMenu={open:openDriverTracking,menu:openRoleMenu};
})();