(()=>{
'use strict';
function cleanSignupUi(){
  document.getElementById('resendConfirmation')?.remove();
  const info=document.getElementById('fastAuthInfo');
  if(info&&/confirmation|confirme/i.test(info.textContent||''))info.remove();
  const help=document.querySelector('#auth .auth-card .help');
  if(help&&/confirmation par e-mail/i.test(help.textContent||'')){
    help.innerHTML='Assistance : <span id="authSupportEmail">contact@gloire-group.com</span>';
  }
  const toast=document.getElementById('toast');
  if(toast&&/vérifiez votre e-mail|confirmez votre adresse e-mail/i.test(toast.textContent||'')){
    toast.textContent='Compte créé. Vous pouvez vous connecter immédiatement.';
  }
}
function watchMessages(){
  const toast=document.getElementById('toast');
  if(!toast||toast.dataset.fastSignupWatch==='1')return;
  toast.dataset.fastSignupWatch='1';
  new MutationObserver(cleanSignupUi).observe(toast,{childList:true,subtree:true,characterData:true});
}
window.addEventListener('load',()=>{cleanSignupUi();watchMessages();setTimeout(()=>{cleanSignupUi();watchMessages()},700)});
setInterval(cleanSignupUi,3500);
})();
