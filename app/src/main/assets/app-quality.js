(()=>{
'use strict';
const q=id=>document.getElementById(id);
let networkTimer=null,mapTimer=null;
function pill(text,ok=false){let p=q('fastNetworkPill');if(!p){p=document.createElement('div');p.id='fastNetworkPill';p.className='fast-network-pill';document.body.appendChild(p)}p.textContent=text;p.classList.toggle('ok',ok);p.classList.add('show');clearTimeout(networkTimer);networkTimer=setTimeout(()=>p.classList.remove('show'),ok?1800:3500)}
function mapFailure(message){const host=q('sharedMapWrap');if(!host||host.querySelector('.fast-map-failure'))return;const x=document.createElement('div');x.className='fast-map-failure';x.innerHTML='<div><b>Carte momentanément indisponible</b><small>'+String(message||'Vérifiez votre connexion puis réessayez.')+'</small><br><button type="button">Réessayer</button></div>';x.querySelector('button').onclick=()=>location.reload();host.appendChild(x)}
function a11y(){document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button');if(!b.getAttribute('aria-label')){const t=(b.textContent||'').replace(/\s+/g,' ').trim();if(t)b.setAttribute('aria-label',t)}});document.querySelectorAll('input').forEach(i=>{if(!i.getAttribute('aria-label'))i.setAttribute('aria-label',i.placeholder||i.id||'Champ')})}
function preventRapidTap(){document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled||b.dataset.fastTapGuard==='off')return;const now=Date.now(),last=Number(b.dataset.fastLastTap||0);if(now-last<420){e.preventDefault();e.stopImmediatePropagation();return}b.dataset.fastLastTap=String(now)},true)}
function watchMap(){clearTimeout(mapTimer);mapTimer=setTimeout(()=>{const canvas=q('map');if(!canvas)return;const text=q('mapEngineText')?.textContent||'';const hasGoogle=!!(window.google&&google.maps);if(!hasGoogle&&!/Google Maps/i.test(text))mapFailure('Google Maps n’a pas pu démarrer. Vérifiez que Maps JavaScript API est activée pour la clé FAST.')},12000)}
window.addEventListener('online',()=>pill('Connexion rétablie',true));window.addEventListener('offline',()=>pill('Mode hors connexion'));
window.addEventListener('error',e=>{const m=String(e?.message||'');if(/google|maps/i.test(m)){console.warn('FAST map error',e.error||m);mapFailure('Erreur de chargement Google Maps.')}});
window.addEventListener('unhandledrejection',e=>{const m=String(e?.reason?.message||e?.reason||'');if(/google|maps/i.test(m))console.warn('FAST map promise',m)});
window.addEventListener('load',()=>{a11y();preventRapidTap();watchMap();const observer=new MutationObserver(()=>a11y());observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),12000);if(!navigator.onLine)pill('Mode hors connexion')});
})();
