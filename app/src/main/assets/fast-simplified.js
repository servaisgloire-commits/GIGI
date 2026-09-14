/* FAST N°1 — Google Maps presentation + single FAST service. */
(() => {
  let fastMapFrame = null;
  let driverLivePos = null;

  const point = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
    ? {lat:Number(value.lat), lng:Number(value.lng)} : null;

  const ridePoint = (ride, prefix) => {
    const lat = Number(ride?.[`${prefix}_lat`]);
    const lng = Number(ride?.[`${prefix}_lng`]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? {lat,lng} : null;
  };

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

  const originalRenderDriverRide = window.renderDriverRide;
  if (typeof originalRenderDriverRide === 'function') {
    window.renderDriverRide = function renderDriverRideGoogle(){
      originalRenderDriverRide();
      refreshGoogleMap();
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const type = $('vehicleType');
    if (type) type.value = 'standard';
    $('clearPickup')?.addEventListener('click', refreshGoogleMap);
    $('clearDestination')?.addEventListener('click', refreshGoogleMap);
  });
})();
