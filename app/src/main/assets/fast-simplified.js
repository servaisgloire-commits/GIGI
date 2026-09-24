/* FAST N°1 — Google Maps presentation + single FAST service. */
(() => {
  let fastMapFrame = null;
  let driverLivePos = null;
  let driverNavTimer = null;
  let driverNavRideId = null;
  let driverNavLaunchedForRide = null;
  let driverPanX = 0;
  let driverPanY = 0;

  const point = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
    ? {lat:Number(value.lat), lng:Number(value.lng)} : null;

  const ridePoint = (ride, prefix) => {
    const lat = Number(ride?.[`${prefix}_lat`]);
    const lng = Number(ride?.[`${prefix}_lng`]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? {lat,lng} : null;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function googleMapsUrl() {
    const ride = state.ride || {};
    const pickup = point(state.pickup) || ridePoint(ride, 'pickup');
    const destination = point(state.destination) || ridePoint(ride, 'destination');
    const current = point(state.coords);
    const liveDriver = point(driverLivePos);

    let from = null;
    let to = null;
    if (state.role === 'driver' && current && ride.id) {
      from = current;
      to = ride.status === 'in_progress' ? destination : pickup;
    } else if (liveDriver && pickup && ['accepted','driver_arriving'].includes(ride.status)) {
      from = liveDriver;
      to = pickup;
    } else if (pickup && destination) {
      from = pickup;
      to = destination;
    }

    if (from && to) {
      return `https://www.google.com/maps?output=embed&hl=fr&saddr=${encodeURIComponent(`${from.lat},${from.lng}`)}&daddr=${encodeURIComponent(`${to.lat},${to.lng}`)}&dirflg=d`;
    }

    const focus = current || pickup || liveDriver || {lat:-4.2634,lng:15.2429};
    return `https://www.google.com/maps?output=embed&hl=fr&q=${encodeURIComponent(`${focus.lat},${focus.lng}`)}&z=15`;
  }

  function refreshGoogleMap() {
    if (!fastMapFrame) return;
    const src = googleMapsUrl();
    if (fastMapFrame.dataset.src === src) return;
    fastMapFrame.dataset.src = src;
    fastMapFrame.src = src;
  }

  function setClientRouteDismissed(dismissed) {
    const root = $('app');
    if (!root) return;
    root.classList.toggle('client-route-dismissed', !!dismissed);
  }

  async function syncClientPinState() {
    if (state.role !== 'client' || !state.ride?.id) {
      setClientRouteDismissed(false);
      return false;
    }
    try {
      const r = await rpc('get_ride_security_state',{p_ride_id:state.ride.id});
      const verified = !!(r?.verified || r?.pin_verified || r?.[0]?.verified || r?.[0]?.pin_verified);
      setClientRouteDismissed(verified);
      return verified;
    } catch {
      return false;
    }
  }

  function applyDriverMapPan() {
    const host = $('map');
    if (!host) return;
    host.style.setProperty('--fast-driver-pan-x', `${driverPanX}px`);
    host.style.setProperty('--fast-driver-pan-y', `${driverPanY}px`);
  }

  function resetDriverMapPan() {
    driverPanX = 0;
    driverPanY = 0;
    const host = $('map');
    host?.style.removeProperty('--fast-driver-pan-x');
    host?.style.removeProperty('--fast-driver-pan-y');
  }

  function ensureDriverOneFingerSurface() {
    const host = $('map');
    if (!host) return null;
    let surface = document.getElementById('driverMapTouchSurface');
    if (surface) return surface;

    surface = document.createElement('div');
    surface.id = 'driverMapTouchSurface';
    surface.className = 'driver-map-touch-surface hidden';
    surface.setAttribute('aria-label', 'Carte chauffeur manipulable à un doigt');
    host.appendChild(surface);

    let dragging = false;
    let activePointer = null;
    let lastX = 0;
    let lastY = 0;

    const finishDrag = event => {
      if (!dragging || (event && activePointer !== null && event.pointerId !== activePointer)) return;
      dragging = false;
      surface.classList.remove('dragging');
      if (activePointer !== null) {
        try { surface.releasePointerCapture(activePointer); } catch {}
      }
      activePointer = null;
      event?.preventDefault?.();
      event?.stopPropagation?.();
    };

    surface.addEventListener('pointerdown', event => {
      if (state.role !== 'driver' || state.ride?.status !== 'in_progress') return;
      dragging = true;
      activePointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      surface.classList.add('dragging');
      try { surface.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    surface.addEventListener('pointermove', event => {
      if (!dragging || event.pointerId !== activePointer) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      const maxX = Math.max(28, host.clientWidth * 0.08);
      const maxY = Math.max(42, host.clientHeight * 0.08);
      driverPanX = clamp(driverPanX + dx, -maxX, maxX);
      driverPanY = clamp(driverPanY + dy, -maxY, maxY);
      applyDriverMapPan();
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    surface.addEventListener('pointerup', finishDrag, {passive:false});
    surface.addEventListener('pointercancel', finishDrag, {passive:false});
    return surface;
  }

  function syncDriverOneFingerSurface(active) {
    const surface = ensureDriverOneFingerSurface();
    if (!surface) return;
    surface.classList.toggle('hidden', !active);
    if (!active) resetDriverMapPan();
  }

  window.initMap = function initMapGoogle() {
    if (state.map?.provider === 'google') {
      refreshGoogleMap();
      return;
    }
    const host = $('map');
    if (!host) return;
    host.innerHTML = '<div class="fast-map-loading">Chargement de Google Maps…</div>';
    const frame = document.createElement('iframe');
    frame.id = 'googleMapFrame';
    frame.className = 'google-map-frame';
    frame.setAttribute('title', 'Carte Google Maps FAST');
    frame.setAttribute('loading', 'eager');
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    frame.setAttribute('allowfullscreen', '');
    host.innerHTML = '';
    host.appendChild(frame);
    const badge = document.createElement('div');
    badge.className = 'google-map-badge';
    badge.innerHTML = '<b>Google Maps</b> · FAST N°1';
    host.appendChild(badge);
    fastMapFrame = frame;
    state.map = {
      provider: 'google',
      setView(){ refreshGoogleMap(); return this; },
      fitBounds(){ refreshGoogleMap(); return this; },
      removeLayer(){ return this; }
    };
    refreshGoogleMap();
  };

  window.mapIcon = () => null;
  window.placeMarker = function placeMarkerGoogle(){ refreshGoogleMap(); };
  window.fitMap = function fitMapGoogle(){ refreshGoogleMap(); };
  window.clearDriverMarkers = function clearDriverMarkersGoogle(){ state.driverMarkers = []; };
  window.drawNearby = function drawNearbyGoogle(items){ state.driverMarkers = items || []; };
  window.drawRoute = function drawRouteGoogle(){ refreshGoogleMap(); };

  state.rideType = 'standard';

  window.ridePayload = function singleFastPayload(_type='standard', proposed){
    return {
      pickup_address: state.pickup?.label || $('pickup').value.trim(),
      pickup: {lat:Number(state.pickup.lat), lng:Number(state.pickup.lng)},
      destination_address: state.destination?.label || $('destination').value.trim(),
      destination: {lat:Number(state.destination.lat), lng:Number(state.destination.lng)},
      vehicle_type: 'standard',
      payment_method: state.payment || 'cash',
      ...(proposed != null ? {proposed_price: proposed} : {})
    };
  };

  window.estimate = function estimateSingleFast(){
    return api('/v1/routes/estimate',{method:'POST',auth:false,body:ridePayload('standard')});
  };

  window.updateQuoteUI = function updateSingleFastQuote(q){
    state.quote = q;
    state.rideType = 'standard';
    const currency = q.currency || 'XAF';
    $('routeSummary').innerHTML = `<span>${Number(q.distance_km||0).toFixed(1)} km</span><span>≈ ${Math.round(Number(q.duration_min||0))} min</span>`;
    const p = Number(q.estimated_price || q.standard_price || 0);
    $('suggestedPrice').textContent = money(p,currency);
    if (!$('flexPrice').value || Number($('flexPrice').dataset.base||0) !== p) {
      $('flexPrice').value = Math.round(p);
      $('flexPrice').dataset.base = String(p);
    }
    $('tripOptions').classList.remove('hidden');
    $('bookBtn').disabled = false;
    applyPayments(q.market);
    refreshGoogleMap();
    loadNearby();
  };

  window.quoteAll = async function quoteSingleFast(){
    try {
      await ensurePlace('pickup');
      await ensurePlace('destination');
      $('estimateBtn').disabled = true;
      $('estimateBtn').textContent = 'Calcul en cours…';
      const q = await estimate('standard');
      if (!q) throw new Error('Impossible de calculer le trajet.');
      updateQuoteUI(q);
    } catch (error) {
      toast(error.message);
    } finally {
      $('estimateBtn').disabled = false;
      $('estimateBtn').textContent = 'Calculer le trajet';
    }
  };

  window.selectRideType = async function(){ state.rideType = 'standard'; };

  window.loadNearby = async function loadNearbySingleFast(){
    if (!state.pickup?.lat || !token()) return;
    try {
      const r = await api(`/v1/nearby-drivers?lat=${state.pickup.lat}&lng=${state.pickup.lng}&vehicle_type=standard`);
      drawNearby(r.items || []);
    } catch {}
  };

  window.book = async function bookSingleFast(){
    try {
      $('bookBtn').disabled = true;
      await ensurePlace('pickup');
      await ensurePlace('destination');
      const body = ridePayload('standard', proposedPrice());
      const r = await api('/v1/rides',{method:'POST',body});
      state.ride = r.ride;
      state.quote = r.route || state.quote;
      if (!state.ride?.id) throw new Error('Course non créée.');
      setClientRouteDismissed(false);
      refreshGoogleMap();
      showClientRide();
      await ensurePin();
      await dispatchRide(true);
      startClientPolling();
    } catch (error) {
      toast(error.message);
      $('bookBtn').disabled = false;
    }
  };

  function syncClientCancellation(status = state.ride?.status) {
    const button = $('cancelRideBtn');
    if (!button) return;
    const locked = ['in_progress','completed','cancelled'].includes(status);
    button.classList.toggle('hidden', locked);
    button.disabled = locked;
  }

  const originalShowClientRide = window.showClientRide;
  if (typeof originalShowClientRide === 'function') {
    window.showClientRide = function showClientRideLocked(){
      originalShowClientRide();
      setClientRouteDismissed(false);
      syncClientCancellation();
    };
  }

  const originalPollClientOnce = window.pollClientOnce;
  if (typeof originalPollClientOnce === 'function') {
    window.pollClientOnce = async function pollClientOnceLocked(){
      await originalPollClientOnce();
      syncClientCancellation();
      await syncClientPinState();
    };
  }

  const originalCancelRide = window.cancelRide;
  if (typeof originalCancelRide === 'function') {
    window.cancelRide = async function cancelRideUntilStart(){
      if (['in_progress','completed','cancelled'].includes(state.ride?.status)) {
        syncClientCancellation(state.ride?.status);
        return toast('La course ne peut plus être annulée après son démarrage.');
      }
      setClientRouteDismissed(false);
      return originalCancelRide();
    };
  }

  window.verifyPin = async function verifyPinExactMatch(){
    const id = state.ride?.id;
    if (!id) return;
    const input = $('pinInput');
    const pin = input?.value.trim() || '';
    if (!/^\d{4}$/.test(pin)) {
      $('startRideBtn')?.classList.add('hidden');
      $('pinCheck')?.classList.remove('hidden');
      return toast('Le PIN doit contenir exactement 4 chiffres.');
    }
    try {
      const r = await rpc('verify_ride_pin',{p_ride_id:id,p_pin:pin});
      const verified = r?.verified === true || r?.[0]?.verified === true;
      if (!verified) {
        $('startRideBtn')?.classList.add('hidden');
        $('pinCheck')?.classList.remove('hidden');
        input?.focus();
        input?.select?.();
        return toast('PIN incorrect. Vérifiez le code avec le client.');
      }
      $('pinCheck')?.classList.add('hidden');
      $('startRideBtn')?.classList.remove('hidden');
      toast('PIN vérifié.');
    } catch {
      $('startRideBtn')?.classList.add('hidden');
      $('pinCheck')?.classList.remove('hidden');
      toast('PIN incorrect ou expiré.');
    }
  };

  window.renderDriverClient = function renderDriverClientGoogle(r){
    const d = r.driver || {}, v = r.vehicle || {}, ride = r.ride || state.ride || {};
    if (ride.driver_id) {
      $('driverCard').classList.remove('hidden');
      const name = [d.first_name,d.last_name].filter(Boolean).join(' ') || 'Chauffeur FAST';
      $('driverName').textContent = name;
      $('driverAvatar').textContent = (d.first_name?.[0] || 'F').toUpperCase();
      $('driverVehicle').textContent = [v.make,v.model,v.color,v.plate_number].filter(Boolean).join(' • ') || 'Véhicule FAST';
      $('driverEta').textContent = ride.driver_eta_min ? `${ride.driver_eta_min} min` : 'En route';
    } else {
      $('driverCard').classList.add('hidden');
    }
    if (r.driver_location?.latitude != null && r.driver_location?.longitude != null) {
      driverLivePos = {lat:Number(r.driver_location.latitude),lng:Number(r.driver_location.longitude)};
      refreshGoogleMap();
    }
  };

  function ensureDriverNavigationPanel() {
    let panel = $('driverNavigationPanel');
    if (panel) return panel;
    const rideSheet = $('driverRide');
    if (!rideSheet) return null;
    panel = document.createElement('div');
    panel.id = 'driverNavigationPanel';
    panel.className = 'driver-navigation-panel hidden';
    panel.innerHTML = '<div><small>Temps restant</small><strong id="driverNavigationEta">—</strong><span id="driverNavigationDistance">Calcul en cours…</span></div><button id="expandDriverGps" type="button">Agrandir le GPS</button>';
    const finish = $('finishRideBtn');
    if (finish) rideSheet.insertBefore(panel, finish);
    else rideSheet.appendChild(panel);
    $('expandDriverGps').onclick = () => openDriverNavigation();
    return panel;
  }

  function openDriverNavigation() {
    const destination = ridePoint(state.ride || {}, 'destination') || point(state.destination);
    if (!destination) return toast('Destination indisponible pour la navigation.');
    if (window.FastNative?.openNavigation) {
      window.FastNative.openNavigation(destination.lat, destination.lng);
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destination.lat},${destination.lng}`)}&travelmode=driving&dir_action=navigate`;
    if (window.FastNative?.openExternal) window.FastNative.openExternal(url);
    else window.open(url, '_blank');
  }

  function stopDriverNavigationMode() {
    if (driverNavTimer) clearInterval(driverNavTimer);
    driverNavTimer = null;
    driverNavRideId = null;
    driverNavLaunchedForRide = null;
    $('driverNavigationPanel')?.classList.add('hidden');
    $('map')?.classList.remove('driver-driving-map');
    syncDriverOneFingerSurface(false);
  }

  window.FAST_RESET_RIDE_MAP_STATE = function resetRideMapState(){
    driverLivePos = null;
    stopDriverNavigationMode();
    try { refreshGoogleMap(); } catch {}
  };

  async function refreshDriverNavigation() {
    const ride = state.ride;
    if (state.role !== 'driver' || !ride?.id || ride.status !== 'in_progress') {
      stopDriverNavigationMode();
      return;
    }
    const panel = ensureDriverNavigationPanel();
    panel?.classList.remove('hidden');
    $('map')?.classList.add('driver-driving-map');
    syncDriverOneFingerSurface(true);
    try {
      const nav = await api(`/v1/rides/${ride.id}/navigation`);
      if (!nav?.active) return;
      if (nav.driver_location?.lat != null && nav.driver_location?.lng != null) {
        driverLivePos = {lat:Number(nav.driver_location.lat),lng:Number(nav.driver_location.lng)};
        state.coords = {...driverLivePos};
      }
      const eta = Math.max(1, Math.round(Number(nav.eta_min || 0)));
      const distance = Number(nav.distance_km || 0);
      if ($('driverNavigationEta')) $('driverNavigationEta').textContent = `${eta} min`;
      if ($('driverNavigationDistance')) $('driverNavigationDistance').textContent = distance > 0 ? `${distance.toFixed(1)} km restants` : 'Navigation active';
      refreshGoogleMap();
    } catch {}
  }

  function startDriverNavigationMode({launch=false} = {}) {
    const rideId = state.ride?.id;
    if (!rideId || state.ride?.status !== 'in_progress') return;
    ensureDriverNavigationPanel()?.classList.remove('hidden');
    $('map')?.classList.add('driver-driving-map');
    syncDriverOneFingerSurface(true);
    if (driverNavRideId !== rideId) {
      if (driverNavTimer) clearInterval(driverNavTimer);
      driverNavRideId = rideId;
      refreshDriverNavigation();
      driverNavTimer = setInterval(refreshDriverNavigation, 5000);
    }
    if (launch && driverNavLaunchedForRide !== rideId) {
      driverNavLaunchedForRide = rideId;
      setTimeout(openDriverNavigation, 250);
    }
  }

  const originalRenderDriverRide = window.renderDriverRide;
  if (typeof originalRenderDriverRide === 'function') {
    window.renderDriverRide = function renderDriverRideGoogle(){
      originalRenderDriverRide();
      if (state.ride?.status === 'in_progress') startDriverNavigationMode();
      else stopDriverNavigationMode();
      refreshGoogleMap();
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const type = $('vehicleType');
    if (type) type.value = 'standard';
    $('clearPickup')?.addEventListener('click', refreshGoogleMap);
    $('clearDestination')?.addEventListener('click', refreshGoogleMap);

    const cancelButton = $('cancelRideBtn');
    if (cancelButton && typeof window.cancelRide === 'function') cancelButton.onclick = window.cancelRide;
    syncClientCancellation();

    const verifyButton = $('verifyPinBtn');
    if (verifyButton) verifyButton.onclick = window.verifyPin;

    const startButton = $('startRideBtn');
    if (startButton) {
      startButton.onclick = async () => {
        await setRideStatus('in_progress');
        if (state.ride?.status === 'in_progress') startDriverNavigationMode({launch:true});
      };
    }

    const finishButton = $('finishRideBtn');
    if (finishButton) {
      finishButton.onclick = async () => {
        await setRideStatus('completed');
        stopDriverNavigationMode();
      };
    }
  });
})();
