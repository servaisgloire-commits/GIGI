(()=>{
'use strict';
const q=id=>document.getElementById(id);
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
let lockedUntil=0;

async function recoverPasswordFast(){
  const email=q('loginEmail')?.value.trim()||'';
  const btn=q('forgotBtn');
  if(!emailOk(email))return toast('Entrez votre e-mail de connexion');
  const now=Date.now();
  if(now<lockedUntil){
    const seconds=Math.max(1,Math.ceil((lockedUntil-now)/1000));
    return toast(`Un lien vient déjà d’être demandé. Réessayez dans ${seconds} s.`);
  }
  if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='Envoi…'}
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    let r,d={};
    try{
      r=await fetch(SUPABASE_URL+'/functions/v1/auth-email-memory',{
        method:'POST',
        headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({email,type:'recovery'}),
        signal:controller.signal
      });
      try{d=await r.json()}catch(e){}
    }finally{clearTimeout(timer)}
    if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));
    const retry=Math.max(20,Number(d.retry_after_seconds||120));
    lockedUntil=Date.now()+retry*1000;
    toast(d.message||(d.ok?'E-mail de réinitialisation envoyé. Vérifiez aussi les spams.':'Patientez avant un nouvel essai.'));
  }catch(e){
    lockedUntil=Date.now()+5000;
    const m=String(e?.message||e||'Erreur');
    if(/rate limit|429|security purposes/i.test(m))toast('Un e-mail a déjà été demandé récemment. Patientez quelques minutes.');
    else if(/Failed to fetch|NetworkError|timeout|AbortError|Délai/i.test(m))toast('Connexion internet instable. Réessayez dans quelques secondes.');
    else toast(m);
  }finally{
    if(btn){btn.disabled=false;if(btn.dataset.oldText){btn.textContent=btn.dataset.oldText;delete btn.dataset.oldText}}
  }
}

function bind(){
  window.forgotPassword=recoverPasswordFast;
  const btn=q('forgotBtn');
  if(btn)btn.onclick=recoverPasswordFast;
}
window.addEventListener('load',()=>{bind();setTimeout(bind,900);setTimeout(bind,2200)});
})();
