(()=>{
'use strict';
const $=id=>document.getElementById(id);
let paymentGuard=false,lastBillingKey='',observer=null;

function addStyles(){
  if($('fastFinalCommercialStyle'))return;
  const s=document.createElement('style');s.id='fastFinalCommercialStyle';s.textContent=`
  body.client-mode,#homePage,#historyPage,#profilePage{background:#f4f8ff!important}
  body.client-mode #mainHeader{background:rgba(246,250,255,.98)!important;border-bottom:1px solid #dce9f8!important}
  body.client-mode .booking-panel{background:linear-gradient(180deg,#fff 0%,#f7faff 100%)!important;box-shadow:0 -12px 34px rgba(19,75,138,.10)!important}
  body.client-mode .route-field,body.client-mode .single-service-card,body.client-mode .payment-card,body.client-mode #ridePanel,.card-lite{background:#fff!important;border-color:#dce8f6!important}
  body.client-mode .route-field:focus-within{border-color:#8bbcff!important;box-shadow:0 0 0 4px rgba(22,119,255,.09)!important}
  body.client-mode .nav{background:rgba(248,251,255,.98)!important;border-top-color:#dce8f6!important}
  body.client-mode .nav button.on{color:#0b69ed!important}
  #profilePage{padding:18px 16px 110px!important}
  #profilePage .fast-profile-title{margin:4px 2px 14px;color:#0b2f5e;font-size:23px;font-weight:900;letter-spacing:-.5px}
  #clientBillingCard{order:-10;background:linear-gradient(145deg,#f7fbff,#eaf4ff)!important;border:1px solid #cfe3fb!important;box-shadow:0 12px 30px rgba(20,91,169,.08)!important}
  #clientBillingCard>p:first-of-type{color:#5f7188!important}
  #clientBillingCard label:has(#clientBillingPreferred),#saveClientBilling{display:none!important}
  #clientSavedCard{background:#fff!important;border:1px solid #d7e7f8!important}
  .fast-add-card{width:100%;margin-top:12px;min-height:48px;border:0;border-radius:14px;background:#1677ff;color:#fff;font-weight:900;font-size:13px;box-shadow:0 10px 22px rgba(22,119,255,.18)}
  .fast-add-card.secondary{background:#fff;color:#0b57d0;border:1px solid #bdd7f6;box-shadow:none}
  .fast-card-profile-sheet{position:fixed;inset:0;z-index:12000;background:rgba(9,30,66,.42);display:grid;align-items:end}
  .fast-card-profile-box{background:linear-gradient(180deg,#f8fbff,#fff);border-radius:26px 26px 0 0;padding:22px 18px max(24px,env(safe-area-inset-bottom));box-shadow:0 -18px 50px rgba(15,45,90,.20)}
  .fast-card-profile-box h3{margin:0;color:#102a4c;font-size:20px}.fast-card-profile-box p{color:#64748b;font-size:11px;line-height:1.5}.fast-card-profile-box input{width:100%;height:48px;border:1px solid #cbdcf0;border-radius:13px;padding:0 13px;background:#fff;font-size:14px;outline:none}.fast-card-profile-box input:focus,.fast-profile-stripe.focus{border-color:#1677ff;box-shadow:0 0 0 3px rgba(22,119,255,.09)}
  .fast-profile-stripe{min-height:48px;margin-top:8px;border:1px solid #cbdcf0;border-radius:13px;background:#fff;padding:14px 12px}.fast-card-profile-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:9px;margin-top:14px}.fast-card-profile-actions button{height:47px;border-radius:13px;border:1px solid #d5e2f0;background:#fff;font-weight:850}.fast-card-profile-actions .primary{border:0;background:#1677ff;color:#fff}
  #forgotBtn{display:block!important;visibility:visible!important;opacity:1!important;margin:10px auto 2px!important;color:#0b69ed!important;font-weight:850!important;text-decoration:none!important}
  #auth .auth-card{background:linear-gradient(180deg,#fff,#f4f9ff)!important;border:1px solid #dce9f8!important;box-shadow:0 22px 55px rgba(13,79,150,.13)!important}
  #auth{background:radial-gradient(circle at 80% 10%,rgba(70,166,255,.20),transparent 32%),linear-gradient(180deg,#edf6ff,#fff)!important}
  .fast-client-actions{grid-template-columns:1fr!important}.fast-client-actions .fast-action-btn{background:#eef6ff!important;border-color:#cfe3fb!important;color:#0b57d0!important}
  #clientNav button[data-page="walletPage"]{display:none!important}
  #clientNav{grid-template-columns:repeat(3,1fr)!important}
  #walletPage{display:none!important}
  `;document.head.appendChild(s);
}

function simplifySafety(){
  document.querySelectorAll('#fastSafetyCenter').forEach((b,i)=>{if(i>0)b.remove();else{b.innerHTML='<span>🛡️</span>Sécurité';b.setAttribute('aria-label','Sécurité FAST')}});
  document.querySelectorAll('.fast-safety-head h3').forEach(h=>h.textContent='Sécurité FAST');
  document.querySelectorAll('button,a,[role="button"]').forEach(el=>{
    const t=(el.textContent||'').trim();
    if(/centre de sécurité/i.test(t)&&el.id!=='fastSafetyCenter')el.remove();
  });
}

function ensureForgotPassword(){
  const card=document.querySelector('#auth .auth-card');if(!card)return;
  let btn=$('forgotBtn');
  if(!btn){btn=document.createElement('button');btn.id='forgotBtn';btn.type='button';btn.className='text-btn';btn.textContent='Mot de passe oublié ?';$('loginBtn')?.insertAdjacentElement('afterend',btn)}
  btn.textContent='Mot de passe oublié ?';
  btn.onclick=()=>{
    const fn=window.recoverPasswordFast||window.forgotPassword;
    if(typeof fn==='function')return fn();
    const email=($('loginEmail')?.value||'').trim();
    if(!email)return typeof toast==='function'&&toast('Entrez votre e-mail de connexion');
    fetch((typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'https://hmwxwzfcpdvgzjgxruup.supabase.co')+'/auth/v1/recover?redirect_to='+encodeURIComponent('https://fast-n1-reset.vercel.app'),{method:'POST',headers:{apikey:(typeof SUPABASE_KEY!=='undefined'?SUPABASE_KEY:'sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38'),'Content-Type':'application/json'},body:JSON.stringify({email})}).then(()=>typeof toast==='function'&&toast('E-mail de réinitialisation envoyé')).catch(()=>typeof toast==='function'&&toast('Réinitialisation momentanément indisponible'));
  };
}

function profileTitle(){const p=$('profilePage');if(!p||p.querySelector('.fast-profile-title'))return;const h=document.createElement('div');h.className='fast-profile-title';h.textContent='Mon profil';p.prepend(h)}

async function authFetch(path,opts={}){
  const base=(typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL)||'https://hmwxwzfcpdvgzjgxruup.supabase.co';
  const key=(typeof SUPABASE_KEY!=='undefined'&&SUPABASE_KEY)||'sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38';
  const jwt=(typeof token!=='undefined'&&token)||'';
  const r=await fetch(base+path,{...opts,headers:{apikey:key,Authorization:'Bearer '+jwt,'Content-Type':'application/json',...(opts.headers||{})}});let d=null;try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d?.detail||d?.message||'Opération impossible');return d;
}

async function readBilling(){
  if(typeof token==='undefined'||!token||typeof profile==='undefined'||!profile?.id)return null;
  try{const rows=await authFetch('/rest/v1/client_billing_profiles?user_id=eq.'+encodeURIComponent(profile.id)+'&select=*&limit=1');return rows?.[0]||null}catch(e){return null}
}

function paymentSelectorFor(p){
  const sel=$('paymentMethod');if(!sel||paymentGuard)return;paymentGuard=true;
  try{
    const saved=Boolean(p?.provider_payment_method_id&&p?.account_last4);
    const desired=saved?[['cash','Espèces'],['card',`${String(p.card_brand||'Carte').toUpperCase()} •••• ${p.account_last4}`]]:[['cash','Espèces']];
    const signature=desired.map(x=>x.join(':')).join('|');
    if(sel.dataset.fastFinalPayment!==signature){sel.innerHTML='';desired.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;sel.appendChild(o)});sel.dataset.fastFinalPayment=signature}
    if(!saved||!['cash','card'].includes(sel.value))sel.value='cash';
    const paymentCard=sel.closest('.payment-card');if(paymentCard){const label=paymentCard.querySelector('small');if(label)label.textContent=saved?'Paiement':'Paiement • Espèces'}
  }finally{paymentGuard=false}
}

function ensureCardButton(p){
  const card=$('clientBillingCard');if(!card)return;
  if(card.parentElement?.id!=='profilePage')$('profilePage')?.insertBefore(card,$('profilePage').querySelector('.card-lite'));
  let b=$('fastProfileAddCard');if(!b){b=document.createElement('button');b.id='fastProfileAddCard';b.type='button';b.className='fast-add-card';card.appendChild(b)}
  const saved=Boolean(p?.provider_payment_method_id&&p?.account_last4);b.textContent=saved?'Remplacer ma carte':'Enregistrer une carte';b.classList.toggle('secondary',saved);b.onclick=openCardSetup;
  const info=$('clientBillingStatus');if(info)info.textContent=saved?'Carte enregistrée dans votre profil. Vous pouvez payer en espèces ou avec cette carte.':'Aucune carte enregistrée : le paiement proposé pendant une course reste Espèces.';
}

function loadStripe(){if(window.Stripe)return Promise.resolve(window.Stripe);return new Promise((resolve,reject)=>{let s=document.querySelector('script[data-fast-final-stripe]');if(s){s.addEventListener('load',()=>resolve(window.Stripe),{once:true});return}s=document.createElement('script');s.src='https://js.stripe.com/v3/';s.async=true;s.dataset.fastFinalStripe='1';s.onload=()=>window.Stripe?resolve(window.Stripe):reject(new Error('Paiement indisponible'));s.onerror=()=>reject(new Error('Paiement indisponible'));document.head.appendChild(s)})}

async function openCardSetup(){
  document.querySelector('.fast-card-profile-sheet')?.remove();
  const sheet=document.createElement('div');sheet.className='fast-card-profile-sheet';sheet.innerHTML=`<div class="fast-card-profile-box"><h3>Enregistrer une carte</h3><p>La carte est enregistrée depuis votre profil. FAST ne stocke jamais le numéro complet ni le CVC.</p><input id="fastProfileCardHolder" autocomplete="cc-name" placeholder="Nom du titulaire"><div id="fastProfileCardElement" class="fast-profile-stripe"></div><small id="fastProfileCardStatus" style="display:block;margin-top:9px;color:#64748b">Connexion au paiement sécurisé…</small><div class="fast-card-profile-actions"><button type="button" data-close>Annuler</button><button type="button" class="primary" id="fastProfileCardSave">Enregistrer</button></div></div>`;document.body.appendChild(sheet);sheet.querySelector('[data-close]').onclick=()=>sheet.remove();
  try{
    const cfg=await authFetch('/functions/v1/fast-card-payment/config');if(!cfg?.configured||!cfg?.publishable_key)throw new Error('Le paiement carte sécurisé n’est pas encore activé.');
    const setup=await authFetch('/functions/v1/fast-card-payment/setup',{method:'POST',body:'{}'});const StripeCtor=await loadStripe();const stripe=StripeCtor(cfg.publishable_key),elements=stripe.elements({locale:'fr'}),el=elements.create('card',{style:{base:{fontSize:'16px',color:'#102a4c','::placeholder':{color:'#94a3b8'}}}});el.mount('#fastProfileCardElement');el.on('focus',()=>document.querySelector('.fast-profile-stripe')?.classList.add('focus'));el.on('blur',()=>document.querySelector('.fast-profile-stripe')?.classList.remove('focus'));$('fastProfileCardStatus').textContent='Saisie sécurisée prête.';
    $('fastProfileCardSave').onclick=async()=>{const btn=$('fastProfileCardSave'),holder=($('fastProfileCardHolder')?.value||'').trim();if(holder.length<2)return typeof toast==='function'&&toast('Entrez le nom du titulaire');btn.disabled=true;btn.textContent='Enregistrement…';try{const result=await stripe.confirmCardSetup(setup.client_secret,{payment_method:{card:el,billing_details:{name:holder}}});if(result.error)throw new Error(result.error.message||'Carte refusée');if(result.setupIntent?.status!=='succeeded')throw new Error('Enregistrement non confirmé');await authFetch('/functions/v1/fast-card-payment/save-card',{method:'POST',body:JSON.stringify({setup_intent_id:result.setupIntent.id,holder_name:holder})});typeof toast==='function'&&toast('Carte enregistrée dans votre profil');sheet.remove();await refreshPaymentProfile(true)}catch(e){$('fastProfileCardStatus').textContent=e.message||'Enregistrement impossible';btn.disabled=false;btn.textContent='Enregistrer'}};
  }catch(e){$('fastProfileCardStatus').textContent=e.message||'Paiement carte indisponible';$('fastProfileCardSave').disabled=true}
}

async function refreshPaymentProfile(force=false){
  if(typeof role!=='undefined'&&role!=='client')return;const p=await readBilling(),key=JSON.stringify([p?.provider_payment_method_id,p?.account_last4,p?.card_brand]);if(force||key!==lastBillingKey){lastBillingKey=key;ensureCardButton(p);paymentSelectorFor(p)}else paymentSelectorFor(p)
}

function keepClean(){addStyles();simplifySafety();ensureForgotPassword();profileTitle();refreshPaymentProfile(false);const c=$('clientBillingCard');if(c&&c.parentElement?.id!=='profilePage')$('profilePage')?.prepend(c)}

window.addEventListener('load',()=>{setTimeout(keepClean,700);setTimeout(keepClean,1700);setTimeout(()=>refreshPaymentProfile(true),2500)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>refreshPaymentProfile(true),200)});
document.addEventListener('click',e=>{if(e.target.closest('[data-page="profilePage"]'))setTimeout(()=>refreshPaymentProfile(true),120)},true);
observer=new MutationObserver(()=>{clearTimeout(window.__fastFinalUiTimer);window.__fastFinalUiTimer=setTimeout(keepClean,80)});observer.observe(document.documentElement,{childList:true,subtree:true});
setInterval(keepClean,4000);
})();
