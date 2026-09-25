/* Back navigates within FAST before Android may offer to exit at the root. */
(() => {
  let history=['home'];
  let restoring=false;
  const visible=id=>{const el=$(id);return !!el&&!el.classList.contains('hidden');};
  const resetExit=()=>{try{window.FastNative?.resetBackExit?.();}catch{}};
  const originalSwitchView=window.switchView;
  window.switchView=function switchViewWithHistory(name){
    const view=['activity','vehicle','profile'].includes(name)?name:'home';
    if(!restoring){
      if(view==='home')history=['home'];
      else if(history[history.length-1]!==view)history.push(view);
      resetExit();
    }
    return originalSwitchView.apply(this,arguments);
  };
  const originalShowAuth=window.showAuth;
  window.showAuth=function showAuthWithFreshHistory(){history=['home'];resetExit();return originalShowAuth.apply(this,arguments);};
  const originalAuthMode=window.authMode;
  window.authMode=function authModeWithBackReset(){resetExit();return originalAuthMode.apply(this,arguments);};

  window.FAST_HANDLE_BACK=function handleBackWithinFast(){
    const auth=$('auth')?.classList.contains('active');
    if(auth){
      if(visible('signupForm')){authMode('login');return true;}
      return false;
    }
    if(!$('app')?.classList.contains('active'))return true;
    const overlay=['activity','vehicle','profile'].find(name=>visible(`${name}View`));
    if(overlay){
      if(history[history.length-1]===overlay)history.pop();
      else history=['home'];
      restoring=true;
      try{originalSwitchView(history[history.length-1]||'home');}finally{restoring=false;}
      resetExit();return true;
    }
    let suggestions=false;
    for(const kind of ['pickup','destination']){
      const list=$(`${kind}Suggestions`);
      if(list?.textContent.trim()){list.innerHTML='';suggestions=true;}
    }
    if(suggestions){document.dispatchEvent(new Event('fast:dismiss-address-search'));document.activeElement?.blur?.();resetExit();return true;}
    if(!state.ride && visible('tripOptions')){
      $('tripOptions').classList.add('hidden');
      document.activeElement?.blur?.();resetExit();return true;
    }
    // An active ride stays intact: Back never cancels it or changes its status.
    history=['home'];
    return false;
  };
  document.addEventListener('pointerdown',resetExit,{passive:true});
  document.addEventListener('input',resetExit,{passive:true});
})();
