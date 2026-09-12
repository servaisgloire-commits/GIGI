(()=>{
'use strict';
function tmToast(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function openDriverTracking(){
  document.querySelector('.fast-shortcut-sheet')?.remove();
  try{
    if(typeof role!=='undefined'&&role!=='client')return;
    if(typeof currentRideId==='undefined'||!currentRideId)return tmToast('Aucune course active à suivre');
    try{if(typeof showPage==='function')showPage('homePage')}catch(e){}
    document.body.classList.add('fast-passenger-waiting-driver');
    document.getElementById('historyPage')?.classList.add('hidden');
    document.getElementById('profilePage')?.classList.add('hidden');
    document.getElementById('homePage')?.classList.remove('hidden');
    setTimeout(()=>{
      try{window.FASTPassengerTracking?.refresh?.()}catch(e){}
      try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}
    },80);
  }catch(e){tmToast('Suivi chauffeur momentanément indisponible')}
}
function augmentTrackingMenu(){
  const list=document.querySelector('.fast-shortcut-sheet .fast-shortcut-list');
  if(!list||list.querySelector('[data-fast-shortcut="tracking"]'))return;
  const btn=document.createElement('button');
  btn.type='button';btn.className='fast-shortcut-item';btn.dataset.fastShortcut='tracking';
  btn.innerHTML='<span>📍</span><span><b>Suivi du chauffeur</b><small>Voir son déplacement sur la carte</small></span><span class="arrow">›</span>';
  btn.onclick=openDriverTracking;
  const home=list.querySelector('[data-fast-shortcut="home"]');
  if(home?.nextSibling)list.insertBefore(btn,home.nextSibling);else list.prepend(btn);
}
document.addEventListener('click',e=>{if(e.target?.closest?.('#menuBtn'))setTimeout(augmentTrackingMenu,0)},true);
const observer=new MutationObserver(()=>{if(document.querySelector('.fast-shortcut-sheet'))augmentTrackingMenu()});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.FASTTrackingMenu={open:openDriverTracking};
})();