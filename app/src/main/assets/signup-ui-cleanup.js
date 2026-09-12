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
}
window.addEventListener('load',()=>{cleanSignupUi();setTimeout(cleanSignupUi,700)});
setInterval(cleanSignupUi,3500);
})();
