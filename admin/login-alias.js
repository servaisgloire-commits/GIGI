(()=>{
'use strict';
const ADMIN_ALIAS='admin';
const ADMIN_EMAIL='admin@fast.local';

async function fastAdminAliasLogin(){
  const id=document.getElementById('loginEmail');
  const password=document.getElementById('loginPassword');
  const errorBox=document.getElementById('loginError');
  const button=document.getElementById('loginBtn');
  if(!id||!password||!button)return;
  const raw=(id.value||'').trim();
  if(!raw){errorBox.textContent='Entrez votre identifiant.';return;}
  errorBox.textContent='';button.disabled=true;button.textContent='Connexion…';
  try{
    const email=raw.toLowerCase()===ADMIN_ALIAS?ADMIN_EMAIL:raw;
    const {error}=await sb.auth.signInWithPassword({email,password:password.value});
    if(error)throw error;
    await openAdmin();
  }catch(e){
    errorBox.textContent='Identifiant ou mot de passe incorrect.';
  }finally{
    button.disabled=false;button.textContent='Se connecter';
  }
}

function bindAliasLogin(){
  const input=document.getElementById('loginEmail');
  const password=document.getElementById('loginPassword');
  const button=document.getElementById('loginBtn');
  if(input){input.type='text';input.placeholder='Admin';input.autocapitalize='none';input.autocomplete='username';}
  if(button)button.onclick=fastAdminAliasLogin;
  if(password){password.onkeydown=e=>{if(e.key==='Enter')fastAdminAliasLogin()};}
}

bindAliasLogin();
window.addEventListener('load',bindAliasLogin,{once:true});
})();
