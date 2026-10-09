/* Global address lookup: retain selected places and ignore stale responses. */
(() => {
  const searches = new Map();
  const selections = new Map();
  const generation = {pickup:0, destination:0};
  const timers = {};
  const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
  const blockNativeMap = blocked => {
    try { window.FastNative?.setMainMapInteractionBlocked?.(!!blocked); } catch {}
  };
  const validPoint = value => value?.lat != null && value?.lng != null &&
    Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) &&
    Math.abs(Number(value.lat)) <= 90 && Math.abs(Number(value.lng)) <= 180;

  function errorMessage(error) {
    return error instanceof TypeError || error?.status >= 500 || error?.status === 429
      ? 'Recherche d’adresse temporairement indisponible. Vérifiez votre connexion puis réessayez.'
      : error.message;
  }

  async function lookup(text) {
    const q = clean(text);
    const coords = validPoint(state.coords) ? state.coords : null;
    const bias = coords ? `&lat=${Number(coords.lat)}&lng=${Number(coords.lng)}` : '';
    const key = q + bias;
    const previous = searches.get(key);
    if (previous && Date.now() - previous.time < 30000) return previous.promise;
    const readItems = response => {
      if (!Array.isArray(response?.items)) throw new TypeError('Invalid address response');
      return response.items.filter(item => clean(item.label) && (item.id || validPoint(item)));
    };
    const promise = api(`/v1/places/autocomplete?q=${encodeURIComponent(q)}${bias}`, {auth:false})
      .then(async response => {
        let items = readItems(response);
        // GPS is a preference, never a restriction on where a passenger may search.
        if (!items.length && bias) {
          items = readItems(await api(`/v1/places/autocomplete?q=${encodeURIComponent(q)}`, {auth:false}));
        }
        if (!items.length) searches.delete(key);
        return items;
      }).catch(error => { searches.delete(key); throw error; });
    searches.set(key, {time:Date.now(), promise});
    if (searches.size > 40) searches.delete(searches.keys().next().value);
    return promise;
  }

  window.suggest = async function suggestCurrentAddress(kind, input, target) {
    const q = clean(input.value), revision = ++generation[kind];
    if (q.length < 2 || (kind === 'pickup' && q === 'Ma position actuelle')) { target.innerHTML=''; blockNativeMap(false); return; }
    blockNativeMap(true);
    target.textContent = 'Recherche…';
    try {
      const items = await lookup(q);
      if (revision !== generation[kind] || clean(input.value) !== q) return;
      if (!items.length) { target.textContent='Aucune adresse trouvée. Précisez la ville ou le code postal.'; blockNativeMap(false); return; }
      target.innerHTML = items.slice(0,5).map((item,i) => `<button type="button" data-i="${i}">📍 ${escapeHtml(item.label)}</button>`).join('');
      [...target.children].forEach((button,i) => {
        let chosen=false;
        const choose = event => {
          event?.preventDefault?.(); event?.stopPropagation?.();
          if(chosen)return;
          chosen=true;
          window.selectPlace(kind,items[i],input,target);
        };
        button.addEventListener('pointerup', choose);
        button.addEventListener('click', choose);
      });
    } catch (error) {
      if (revision === generation[kind] && clean(input.value) === q) { target.textContent=errorMessage(error); blockNativeMap(false); }
    }
  };

  window.selectPlace = async function selectCurrentAddress(kind, item, input, target) {
    clearTimeout(timers[kind]);
    const text = clean(input.value);
    const revision = ++generation[kind];
    state[kind] = null;
    const pending = (async () => {
      try {
        const place = await detailsFor(item);
        if (revision !== generation[kind] || clean(input.value) !== text) return null;
        if (!validPoint(place)) throw new Error('Les coordonnées de cette adresse sont indisponibles. Choisissez une autre suggestion.');
        state[kind]=place; input.value=place.label; target.innerHTML=''; blockNativeMap(false);
        placeMarker(kind,place);
        if (kind === 'destination' || state.destination) await quoteAll();
        return place;
      } catch (error) { if (revision === generation[kind]) toast(errorMessage(error)); return null; }
    })();
    selections.set(kind,pending);
    try { return await pending; } finally { if(selections.get(kind)===pending) selections.delete(kind); }
  };

  window.ensurePlace = async function ensureCurrentAddress(kind) {
    if (validPoint(state[kind])) return state[kind];
    if (selections.has(kind)) {
      const place = await selections.get(kind);
      if (place) return place;
    }
    const input=$(kind), q=clean(input.value);
    if (kind==='pickup' && validPoint(state.coords) && (!q || q==='Ma position actuelle')) {
      return state.pickup={...state.coords,label:'Ma position actuelle'};
    }
    if(q.length<2) throw new Error(kind==='pickup'?'Indiquez votre départ.':'Indiquez votre destination.');
    let items;
    try { items=await lookup(q); } catch(error) { throw new Error(errorMessage(error)); }
    if(clean(input.value)!==q) throw new Error('L’adresse a changé. Confirmez votre nouvelle adresse.');
    if(!items.length) throw new Error('Aucune adresse trouvée. Précisez la ville ou le code postal.');
    const place=await detailsFor(items[0]);
    if(clean(input.value)!==q) throw new Error('L’adresse a changé. Confirmez votre nouvelle adresse.');
    if(!validPoint(place)) throw new Error('Les coordonnées de cette adresse sont indisponibles. Choisissez une autre suggestion.');
    state[kind]=place; input.value=place.label; placeMarker(kind,place); return place;
  };

  document.addEventListener('DOMContentLoaded', () => {
    for(const kind of ['pickup','destination']) {
      const input=$(kind), target=$(`${kind}Suggestions`);
      target.addEventListener('pointerdown',event=>event.stopPropagation());
      target.addEventListener('touchstart',event=>event.stopPropagation(),{passive:true});
      input.oninput=()=>{
        ++generation[kind]; state[kind]=null; target.innerHTML='';
        clearTimeout(timers[kind]);
        timers[kind]=setTimeout(()=>window.suggest(kind,input,target),280);
      };
      $(`clear${kind[0].toUpperCase()}${kind.slice(1)}`)?.addEventListener('click',()=>{
        ++generation[kind]; clearTimeout(timers[kind]); blockNativeMap(false);
      });
    }
  });
  document.addEventListener('fast:dismiss-address-search',()=>{
    for(const kind of ['pickup','destination']){++generation[kind];clearTimeout(timers[kind]);}
    blockNativeMap(false);
  });
})();

