(()=>{
  const $=id=>document.getElementById(id);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let visibilityPaused=false;

  function forceDriverHome(){
    if(typeof role==='undefined'||role!=='driver')return;
    const home=$('homePage'),driver=$('driverArea'),passenger=$('passengerArea'),profilePage=$('profilePage');
    if(home)home.classList.remove('hidden');
    if(driver)driver.classList.remove('hidden');
    if(passenger)passenger.classList.add('hidden');
    if(profilePage)profilePage.classList.add('hidden');
    document.querySelectorAll('.pageview').forEach(p=>{if(p.id!=='homePage')p.classList.add('hidden')});
    document.querySelectorAll('#clientNav button').forEach(b=>b.classList.toggle('on',b.dataset.page==='homePage'));
    requestAnimationFrame(()=>{try{map&&map.resize()}catch(e){}});
  }

  function polishLoading(){
    document.body.classList.add('fast-optimized');
    const btn=$('bookBtn');
    if(btn&&!btn.dataset.fastOptimized){
      btn.dataset.fastOptimized='1';
      btn.addEventListener('click',()=>{btn.classList.add('busy');setTimeout(()=>btn.classList.remove('busy'),1800)},{passive:true});
    }
  }

  function networkBadge(){
    let el=$('fastNetworkState');
    if(!el){
      el=document.createElement('div');el.id='fastNetworkState';el.className='fast-network-state';document.body.appendChild(el);
    }
    const online=navigator.onLine;
    el.textContent=online?'FAST connecté':'Connexion interrompue';
    el.classList.toggle('offline',!online);
    el.classList.add('show');setTimeout(()=>el.classList.remove('show'),online?900:2400);
  }

  function reduceWorkInBackground(){
    document.addEventListener('visibilitychange',()=>{
      visibilityPaused=document.hidden;
      if(!document.hidden){
        forceDriverHome();
        try{map&&map.resize()}catch(e){}
        if(typeof role!=='undefined'&&role==='client'&&typeof loadNearbyDrivers==='function')loadNearbyDrivers().catch(()=>{});
      }
    });
  }

  function guardRepeatedClicks(){
    let last=0;
    document.addEventListener('click',e=>{
      const target=e.target.closest('button');if(!target)return;
      const now=Date.now();
      if(now-last<180&&target.id!=='driverToggleInput'){e.preventDefault();e.stopImmediatePropagation();return}
      last=now;
    },true);
  }

  async function bootstrap(){
    polishLoading();networkBadge();reduceWorkInBackground();guardRepeatedClicks();
    window.addEventListener('online',networkBadge);window.addEventListener('offline',networkBadge);
    for(let i=0;i<20;i++){
      if(typeof role!=='undefined'&&typeof profile!=='undefined'&&profile){forceDriverHome();break}
      await sleep(150);
    }
    setTimeout(forceDriverHome,700);
  }
  window.addEventListener('load',bootstrap,{once:true});
})();
