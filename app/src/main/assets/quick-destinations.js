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
  function render(){
    document.querySelectorAll('[data-quick-destination]').forEach(btn=>{
      const k=btn.dataset.quickDestination, d=read(k), m=META[k];
      btn.classList.toggle('configured',!!d);
      btn.innerHTML=`<span class="quick-icon">${m.icon}</span><span class="quick-copy"><b>${m.label}</b><small>${d?short(d.label):'À configurer'}</small></span><span class="quick-edit">${d?'Modifier':'Ajouter'}</span>`;
    });
  }
  function close(){const m=$('quickDestinationModal');if(m)m.classList.remove('open')}
  function open(k){
    const m=META[k],saved=read(k),modal=$('quickDestinationModal');
    modal.dataset.kind=k;
    $('quickModalTitle').textContent=m.label;
    $('quickModalSubtitle').textContent=saved?'Adresse enregistrée':'Configurez ce raccourci';
    $('quickAddressInput').value=saved?.label||'';
    $('quickAddressHint').textContent=m.hint;
    modal.classList.add('open');
    setTimeout(()=>$('quickAddressInput').focus(),120);
  }
  async function geocodeLabel(label){
    try{
      if(typeof api==='function'){
        const d=await api('/v1/places/autocomplete?q='+encodeURIComponent(label));
        const item=(d.items||[])[0];
        if(item){
          if(item.provider==='google'&&!item.lat){const p=await api('/v1/places/details?place_id='+encodeURIComponent(item.id));return {label:p.label,lat:Number(p.lat),lng:Number(p.lng)}}
          if(item.lat&&item.lng)return {label:item.label,lat:Number(item.lat),lng:Number(item.lng)};
        }
      }
    }catch(e){}
    return {label};
  }
  async function save(){
    const modal=$('quickDestinationModal'),k=modal.dataset.kind,label=$('quickAddressInput').value.trim();
    if(!label){ if(typeof toast==='function')toast('Entrez une adresse'); return; }
    $('quickSaveBtn').disabled=true;$('quickSaveBtn').textContent='Enregistrement…';
    const loc=await geocodeLabel(label);write(k,loc);
    $('quickSaveBtn').disabled=false;$('quickSaveBtn').textContent='Enregistrer';close();
    if(typeof toast==='function')toast(META[k].label+' enregistré');
  }
  async function use(k){
    const d=read(k);if(!d)return open(k);
    if(!d.lat||!d.lng){
      const loc=await geocodeLabel(d.label);write(k,loc);if(!loc.lat)return open(k);
    }
    const final=read(k);
    if(typeof destination!=='undefined') destination={label:final.label,lat:Number(final.lat),lng:Number(final.lng)};
    const input=$('destinationInput');if(input)input.value=final.label;
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
    $('quickAddressInput').addEventListener('keydown',e=>{if(e.key==='Enter')save()});
  }
  window.addEventListener('DOMContentLoaded',()=>{
    inject();render();
    document.querySelectorAll('[data-quick-destination]').forEach(btn=>{
      let timer=null,long=false;
      btn.addEventListener('pointerdown',()=>{long=false;timer=setTimeout(()=>{long=true;open(btn.dataset.quickDestination)},650)});
      btn.addEventListener('pointerup',()=>{clearTimeout(timer);if(!long)use(btn.dataset.quickDestination)});
      btn.addEventListener('pointerleave',()=>clearTimeout(timer));
    });
  });
})();
