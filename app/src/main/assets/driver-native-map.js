/* FAST N°1 — native Google Maps surface for drivers only. */
(() => {
  const activeStatuses = new Set(['accepted', 'driver_arriving', 'in_progress']);
  const launchedPhases = new Set();

  const point = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
    ? {lat:Number(value.lat), lng:Number(value.lng)} : null;

  const ridePoint = (ride, prefix) => {
    const lat = Number(ride?.[`${prefix}_lat`]);
    const lng = Number(ride?.[`${prefix}_lng`]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? {lat,lng} : null;
  };

  function phaseForRide(ride) {
    return ride?.status === 'in_progress' ? 'to_destination' : 'to_pickup';
  }

  function targetForRide(ride, phase) {
    return phase === 'to_pickup' ? ridePoint(ride, 'pickup') : ridePoint(ride, 'destination');
  }

  function targetLabelForRide(ride, phase) {
    if (phase === 'to_pickup') return ride?.pickup_address || 'Point de prise en charge';
    return ride?.destination_address || 'Destination';
  }

  function ensureLauncher() {
    const host = document.getElementById('map');
    if (!host) return null;
    let launcher = document.getElementById('driverNativeMapLauncher');
    if (launcher) return launcher;
    launcher = document.createElement('div');
    launcher.id = 'driverNativeMapLauncher';
    launcher.className = 'driver-native-map-launcher hidden';
    launcher.innerHTML = `
      <button id="openNativeDriverMap" type="button" class="driver-native-map-button">
        <span class="driver-native-map-icon">⌖</span>
        <span><b>Carte chauffeur</b><small id="driverNativeMapHint">Ouvrir la navigation</small></span>
      </button>`;
    host.appendChild(launcher);
    document.getElementById('openNativeDriverMap')?.addEventListener('click', () => launchNativeDriverMap(true));
    return launcher;
  }

  async function navigationSnapshot(ride) {
    try {
      const nav = await api(`/v1/rides/${ride.id}/navigation`);
      return nav || {};
    } catch {
      return {};
    }
  }

  async function launchNativeDriverMap(force = false) {
    const ride = state.ride;
    if (state.role !== 'driver' || !ride?.id || !activeStatuses.has(ride.status)) return;

    const expectedPhase = phaseForRide(ride);
    const launchKey = `${ride.id}:${expectedPhase}`;
    if (!force && launchedPhases.has(launchKey)) return;

    const nav = await navigationSnapshot(ride);
    const phase = nav.phase === 'to_pickup' || nav.phase === 'to_destination' ? nav.phase : expectedPhase;
    const target = targetForRide(ride, phase);
    if (!target) return toast('Destination indisponible pour la carte chauffeur.');

    const current = nav.driver_location?.lat != null && nav.driver_location?.lng != null
      ? {lat:Number(nav.driver_location.lat), lng:Number(nav.driver_location.lng)}
      : point(state.coords);
    const eta = Number(nav.eta_min || 0);
    const distance = Number(nav.distance_km || 0);
    const polyline = typeof nav.polyline === 'string' ? nav.polyline : '';
    const label = targetLabelForRide(ride, phase);

    if (window.FastNative?.openDriverMap) {
      launchedPhases.add(`${ride.id}:${phase}`);
      window.FastNative.openDriverMap(
        target.lat,
        target.lng,
        current?.lat || 0,
        current?.lng || 0,
        !!current,
        polyline,
        Number.isFinite(eta) ? eta : 0,
        Number.isFinite(distance) ? distance : 0,
        phase,
        label,
      );
      return;
    }

    if (window.FastNative?.openNavigation) {
      launchedPhases.add(`${ride.id}:${phase}`);
      window.FastNative.openNavigation(target.lat, target.lng);
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${target.lat},${target.lng}`)}&travelmode=driving&dir_action=navigate`;
    window.open(url, '_blank');
  }

  function syncNativeDriverMap({autoLaunch = true} = {}) {
    const ride = state.ride;
    const active = state.role === 'driver' && !!ride?.id && activeStatuses.has(ride.status);
    const root = document.getElementById('app');
    const launcher = ensureLauncher();
    root?.classList.toggle('driver-native-map-active', active);
    launcher?.classList.toggle('hidden', !active);

    const legacySurface = document.getElementById('driverMapTouchSurface');
    if (legacySurface) legacySurface.classList.add('hidden');

    if (!active) return;
    const phase = phaseForRide(ride);
    const hint = document.getElementById('driverNativeMapHint');
    if (hint) hint.textContent = phase === 'to_pickup' ? 'Navigation vers le client' : 'Navigation vers la destination';

    const expand = document.getElementById('expandDriverGps');
    if (expand) {
      expand.textContent = 'Ouvrir la carte';
      expand.onclick = () => launchNativeDriverMap(true);
    }

    if (autoLaunch) {
      const key = `${ride.id}:${phase}`;
      if (!launchedPhases.has(key)) setTimeout(() => launchNativeDriverMap(false), 80);
    }
  }

  const previousRenderDriverRide = window.renderDriverRide;
  if (typeof previousRenderDriverRide === 'function') {
    window.renderDriverRide = function renderDriverRideWithNativeMap(){
      previousRenderDriverRide();
      syncNativeDriverMap();
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startRideBtn');
    if (startButton) {
      startButton.onclick = async () => {
        await setRideStatus('in_progress');
      };
    }
    syncNativeDriverMap({autoLaunch:false});
  });
})();
