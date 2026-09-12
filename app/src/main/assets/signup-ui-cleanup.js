(()=>{
'use strict';

const q=id=>document.getElementById(id);
let signupBusy=false;

function cleanSignupUi(){
  q('resendConfirmation')?.remove();

  const info=q('fastAuthInfo');
  if(info&&/confirmation|confirme/i.test(info.textContent||''))info.remove();

  const help=document.querySelector('#auth .auth-card .help');
  if(help&&/confirmation par e-mail/i.test(help.textContent||'')){
    help.innerHTML='Assistance : <span id="authSupportEmail">contact@gloire-group.com</span>';
  }

  const toastEl=q('toast');
  if(toastEl&&/vérifiez votre e-mail/i.test(toastEl.textContent||'')){
    toastEl.textContent='Compte créé. Connexion en cours…';
  }
  if(toastEl&&/confirmez votre adresse e-mail/i.test(toastEl.textContent||'')){
    toastEl.textContent='Ce compte ancien n’est pas encore actif.';
  }
}

function watchMessages(){
  const toastEl=q('toast');
  if(!toastEl||toastEl.dataset.fastSignupWatch==='1')return;
  toastEl.dataset.fastSignupWatch='1';
  new MutationObserver(cleanSignupUi).observe(toastEl,{childList:true,subtree:true,characterData:true});
}

function validEmail(v){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
}

async function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function loadProfileWithRetry(){
  let lastError=null;
  for(let i=0;i<4;i++){
    try{return await loadMe();}
    catch(e){lastError=e;await wait(350*(i+1));}
  }
  throw lastError||new Error('Profil FAST indisponible');
}

async function immediateSignup(){
  if(signupBusy)return toast('Création du compte déjà en cours…');

  const first=q('firstName')?.value.trim()||'';
  const last=q('lastName')?.value.trim()||'';
  const phone=q('phone')?.value.trim()||'';
  const email=q('signupEmail')?.value.trim()||'';
  const password=q('signupPassword')?.value||'';
  const signupRole=q('signupRole')?.value||'client';
  const btn=q('signupBtn');

  if(!first||!last)return toast('Entrez votre prénom et votre nom');
  if(!validEmail(email))return toast('Entrez une adresse e-mail valide');
  if(password.length<12)return toast('Choisissez un mot de passe d’au moins 12 caractères');
  if(!['client','driver'].includes(signupRole))return toast('Type de compte invalide');

  signupBusy=true;
  const oldText=btn?.textContent||'';
  if(btn){btn.disabled=true;btn.textContent='Création…';}

  try{
    const d=await supa('/auth/v1/signup',{
      method:'POST',
      body:JSON.stringify({
        email,
        password,
        data:{role:signupRole,first_name:first,last_name:last,phone}
      })
    });

    if(!d?.access_token){
      toast('Supabase demande encore une confirmation e-mail. Vérifiez le réglage « Confirm email ».');
      return;
    }

    token=d.access_token;
    localStorage.setItem('fast_access_token',token);
    try{FASTNative.setAccessToken(token)}catch(e){}

    await loadProfileWithRetry();
    showApp();
    toast(signupRole==='driver'?'Compte chauffeur créé. Bienvenue sur FAST.':'Compte passager créé. Bienvenue sur FAST.');
  }catch(e){
    const msg=String(e?.message||e||'Erreur lors de la création du compte');
    if(/already registered|already been registered|user already exists/i.test(msg))toast('Cette adresse e-mail possède déjà un compte FAST.');
    else if(/rate limit|429|security purposes/i.test(msg))toast('Trop de demandes rapprochées. Réessayez dans quelques instants.');
    else toast(msg);
  }finally{
    signupBusy=false;
    if(btn){btn.disabled=false;btn.textContent=oldText||'Créer mon compte FAST';}
  }
}

function installImmediateSignup(){
  window.signup=immediateSignup;
  try{signup=immediateSignup}catch(e){}
  const btn=q('signupBtn');
  if(btn)btn.onclick=immediateSignup;
}

window.addEventListener('load',()=>{
  cleanSignupUi();
  watchMessages();
  installImmediateSignup();
  setTimeout(()=>{cleanSignupUi();watchMessages();installImmediateSignup();},900);
});

setInterval(cleanSignupUi,3500);
})();
