(function(){
  const KEYS={home:'fast_quick_home',work:'fast_quick_work',airport:'fast_quick_airport'};
  const META={
    home:{label:'Maison',icon:'⌂',hint:'Ajoutez votre adresse personnelle'},
    work:{label:'Travail',icon:'▣',hint:'Ajoutez votre lieu de travail'},
    airport:{label:'Aéroport',icon:'✈',hint:'Ajoutez votre aéroport habituel'}
  };
  const $=id=>document.getElementById(id);
  function read(k){try{return JSON.parse(localStorage.getItem(KEYS[k])||'null')}catch(e){return null}}
  function write(k,v){localStorage.setItem(KEYS[k],JSON.stringify(v));render()}
  function short(s){if(!s)return 'À configurer';return s.length>30?s.slice(0,27)+'…':s}
  function notifyConfirmed(loc){
    window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type:'destination',location:loc,source:'quick-destination'}}));
  }
  function render(){
    document.querySelectorAll('[data-quick-destination]').forEach(btn=>{
      const k=btn.dataset.quickDestination,d=read(k),m=META[k];
      btn.classList.toggle('configured',!!(d&&d.lat&&d.lng));
      btn.innerHTML=`<span class="quick-icon">${m.icon}</span><span class="quick-copy"><b>${m.label}</b><small>${d?short(d.label):'À configurer'}</small></span><span class="quick-edit">${d?'Modifier':'Ajouter'}</span>`;
    });
  }
  function close(){const m=$('quickDestinationModal');if(m)m.classList.remove('open')}
  function open(k){
    const m=META[k],saved=read(k),modal=$('quickDestinationModal');
    if(!modal)return;
    modal.dataset.kind=k;
    $('quickModalTitle').textContent=m.label;
    $('quickModalSubtitle').textContent=saved?'Adresse enregistrée':'Configurez ce raccourci';
    $('quickAddressInput').value=saved?.label||'';
    $('quickAddressHint').textContent=m.hint;
    modal.classList.add('open');
    setTimeout(()=>$('quickAddressInput')?.focus(),120);
  }
  async function geocodeLabel(label){
    try{
      if(typeof api!=='function')return null;
      const d=await api('/v1/places/autocomplete?q='+encodeURIComponent(label));
      const item=(d.items||[])[0];
      if(!item)return null;
      let p=item;
      if(item.provider==='google'&&!item.lat){p=await api('/v1/places/details?place_id='+encodeURIComponent(item.id));}
      const lat=Number(p.lat),lng=Number(p.lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
      return {label:p.label||item.label||label,lat,lng};
    }catch(e){return null}
  }
  async function save(){
    const modal=$('quickDestinationModal'),k=modal?.dataset.kind,label=$('quickAddressInput')?.value.trim();
    if(!k||!label){if(typeof toast==='function')toast('Entrez une adresse');return}
    const btn=$('quickSaveBtn');
    if(btn){btn.disabled=true;btn.textContent='Recherche de l’adresse…'}
    const loc=await geocodeLabel(label);
    if(btn){btn.disabled=false;btn.textContent='Enregistrer'}
    if(!loc){if(typeof toast==='function')toast('Adresse introuvable. Précisez la rue ou le quartier.');return}
    write(k,loc);close();
    if(typeof toast==='function')toast(META[k].label+' enregistré');
  }
  async function use(k){
    let d=read(k);if(!d)return open(k);
    if(!Number.isFinite(Number(d.lat))||!Number.isFinite(Number(d.lng))){
      const loc=await geocodeLabel(d.label);
      if(!loc){if(typeof toast==='function')toast('Cette adresse doit être reconfigurée');return open(k)}
      write(k,loc);d=loc;
    }
    const final={label:d.label,lat:Number(d.lat),lng:Number(d.lng)};
    if(typeof destination!=='undefined')destination=final;
    const input=$('destinationInput');if(input)input.value=final.label;
    notifyConfirmed(final);
    if(typeof refreshRoute==='function')await refreshRoute();
    if(typeof toast==='function')toast(META[k].label+' sélectionné');
  }
  function inject(){
    if($('quickDestinationModal'))return;
    const modal=document.createElement('div');modal.id='quickDestinationModal';modal.className='quick-modal';modal.innerHTML=`
      <div class="quick-modal-backdrop" data-close-quick></div>
      <section class="quick-modal-sheet" role="dialog" aria-modal="true">
        <div class="quick-modal-handle"></div>
        <div class="quick-modal-head"><div><small id="quickModalSubtitle">Configurez ce raccourci</small><h3 id="quickModalTitle">Adresse</h3></div><button class="quick-close" data-close-quick>×</button></div>
        <label class="quick-label">Adresse</label>
        <input id="quickAddressInput" class="quick-address-input" placeholder="Ex. Avenue de la Paix, Brazzaville">
        <p id="quickAddressHint" class="quick-address-hint"></p>
        <button id="quickSaveBtn" class="quick-save-btn">Enregistrer</button>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-quick]').forEach(x=>x.onclick=close);
    $('quickSaveBtn').onclick=save;
    $('quickAddressInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save()}});
  }
  window.addEventListener('DOMContentLoaded',()=>{
    inject();render();
    document.querySelectorAll('[data-quick-destination]').forEach(btn=>{
      let timer=null,long=false;
      btn.addEventListener('pointerdown',()=>{long=false;timer=setTimeout(()=>{long=true;open(btn.dataset.quickDestination)},650)});
      btn.addEventListener('pointerup',()=>{clearTimeout(timer);if(!long)use(btn.dataset.quickDestination)});
      btn.addEventListener('pointercancel',()=>clearTimeout(timer));
      btn.addEventListener('pointerleave',()=>clearTimeout(timer));
    });
  });
})();
