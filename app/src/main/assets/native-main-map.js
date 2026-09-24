/* FAST N°1 — native Google Maps bridge for the main app screen.
   Presentation only: existing ride, fare, PIN, payment, cancellation,
   address, vehicle and ERP business rules remain unchanged. */
(() => {
  const previousInitMap = window.initMap;
  const previousUpdateQuoteUI = window.updateQuoteUI;
  const previousRenderDriverClient = window.renderDriverClient;

  function nativeAvailable() {
    try { return !!window.FastNative?.nativeMainMapAvailable?.(); }
    catch { return false; }
  }
  if (!nativeAvailable()) return;

  const point = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
    ? {lat:Number(value.lat), lng:Number(value.lng)} : null;

  function ridePoint(kind) {
    const ride = state?.ride;
    if (!ride) return null;
    const lat = Number(ride[`${kind}_lat`]);
    const lng = Number(ride[`${kind}_lng`]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? {lat, lng} : null;
  }

  function pickupPoint() {
    return point(state?.pickup) || ridePoint('pickup');
  }

  function destinationPoint() {
    return point(state?.destination) || ridePoint('destination');
  }

  function activeRoutePolyline() {
    return String(
      state?.quote?.polyline ||
      state?.ride?.optimized_route_polyline ||
      state?.ride?.route_polyline ||
      ''
    );
  }

  let lastApproachFitAt = 0;

  function call(name, ...args) {
    try {
      const fn = window.FastNative?.[name];
      if (typeof fn === 'function') return fn.apply(window.FastNative, args);
    } catch (error) {
      console.warn(`FAST native map ${name}`, error?.message || error);
    }
    return undefined;
  }

  function installTransparency() {
    if (document.getElementById('fastNativeMainMapStyles')) return;
    const style = document.createElement('style');
    style.id = 'fastNativeMainMapStyles';
    style.textContent = `
      html.fast-native-main-map,
      html.fast-native-main-map body{background:transparent!important}
      html.fast-native-main-map #app.app-screen{background:transparent!important}
      html.fast-native-main-map #map.full-map{
        background:transparent!important;
        pointer-events:none!important;
        touch-action:none!important;
      }
      html.fast-native-main-map #map>*{display:none!important}
      .fast-map-status{
        position:absolute;left:50%;top:92px;transform:translateX(-50%);
        z-index:35;max-width:calc(100% - 32px);padding:9px 13px;border-radius:999px;
        background:rgba(16,35,63,.9);color:#fff;font-size:12px;font-weight:800;
        box-shadow:0 6px 18px rgba(0,0,0,.18);pointer-events:none
      }
      .fast-map-status.hidden{display:none!important}
      .fast-map-status.ok{background:rgba(15,118,70,.92)}
      .fast-map-status.warn{background:rgba(146,64,14,.94)}
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('fast-native-main-map');
  }

  function ensureMapStatus() {
    let el = document.getElementById('fastMapStatus');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'fastMapStatus';
    el.className = 'fast-map-status hidden';
    document.body.appendChild(el);
    return el;
  }

  let statusTimer = null;
  function setMapStatus(message, kind = 'warn', autoHideMs = 0) {
    const el = ensureMapStatus();
    if (statusTimer) clearTimeout(statusTimer);
    el.textContent = message || '';
    el.className = `fast-map-status ${message ? kind : 'hidden'}`;
    if (message && autoHideMs > 0) {
      statusTimer = setTimeout(() => {
        el.className = 'fast-map-status hidden';
        el.textContent = '';
      }, autoHideMs);
    }
  }

  function centerPoint() {
    return point(state?.coords) || pickupPoint() || {lat:-4.2634,lng:15.2429};
  }

  function syncBoundary() {
    const viewport = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const selectors = ['#clientHome','#clientRide','#offerCard','#driverRide'];
    const visibleSheets = selectors
      .map(selector => document.querySelector(selector))
      .filter(el => el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
    let top = viewport;
    visibleSheets.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (Number.isFinite(rect.top)) top = Math.min(top, rect.top);
    });
    const nav = document.getElementById('bottomNav');
    if (!visibleSheets.length && nav && getComputedStyle(nav).display !== 'none') {
      top = Math.min(top, nav.getBoundingClientRect().top);
    }
    if (!Number.isFinite(top) || top <= 0) top = viewport * .58;
    call('setMainMapTouchBoundary', Math.max(0, Math.min(viewport, top)), viewport);
  }

  function syncMarkers() {
    const pickup = pickupPoint();
    const destination = destinationPoint();
    call(
      'setMainMapMarkers',
      !!pickup, pickup?.lat || 0, pickup?.lng || 0,
      !!destination, destination?.lat || 0, destination?.lng || 0,
    );
  }

  function fitCurrentPoints() {
    const pts = [pickupPoint(), destinationPoint()].filter(Boolean);
    if (!pts.length) return;
    if (pts.length === 1) {
      call('setMainMapCamera', pts[0].lat, pts[0].lng, 15);
      return;
    }
    const minLat = Math.min(...pts.map(p => p.lat));
    const maxLat = Math.max(...pts.map(p => p.lat));
    const minLng = Math.min(...pts.map(p => p.lng));
    const maxLng = Math.max(...pts.map(p => p.lng));
    call('fitMainMapBounds', minLat, minLng, maxLat, maxLng);
  }

  function makeNativeMapAdapter() {
    return {
      provider:'google-native-main',
      setView(coords, zoom) {
        const p = Array.isArray(coords)
          ? {lat:Number(coords[0]),lng:Number(coords[1])}
          : point(coords);
        if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
          call('setMainMapCamera', p.lat, p.lng, Number.isFinite(Number(zoom)) ? Number(zoom) : 15);
        }
        return this;
      },
      fitBounds(bounds) {
        const rows = Array.isArray(bounds) ? bounds : [];
        const pts = rows.map(row => Array.isArray(row)
          ? {lat:Number(row[0]),lng:Number(row[1])}
          : point(row)).filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
        if (pts.length === 1) call('setMainMapCamera', pts[0].lat, pts[0].lng, 15);
        if (pts.length > 1) {
          call(
            'fitMainMapBounds',
            Math.min(...pts.map(p=>p.lat)),
            Math.min(...pts.map(p=>p.lng)),
            Math.max(...pts.map(p=>p.lat)),
            Math.max(...pts.map(p=>p.lng)),
          );
        }
        return this;
      },
      removeLayer() { return this; },
      resize() { syncBoundary(); return this; },
    };
  }

  function initNativeMainMap() {
    installTransparency();
    const center = centerPoint();
    call('enableMainMap', center.lat, center.lng, 15);
    state.map = makeNativeMapAdapter();
    syncMarkers();
    const route = activeRoutePolyline();
    if (route) call('setMainMapRoute', route);
    syncBoundary();
    requestAnimationFrame(syncBoundary);
  }

  window.initMap = initNativeMainMap;

  window.placeMarker = function placeMarkerNative(kind, coords) {
    syncMarkers();
    fitCurrentPoints();
  };

  window.fitMap = fitCurrentPoints;

  window.clearDriverMarkers = function clearDriverMarkersNative() {
    state.driverMarkers = [];
    call('clearMainMapNearbyDrivers');
  };

  window.drawNearby = function drawNearbyNative(items) {
    const rows = (items || []).filter(item => point(item)).map(item => ({lat:Number(item.lat),lng:Number(item.lng)}));
    state.driverMarkers = rows;
    call('setMainMapNearbyDrivers', JSON.stringify(rows));
  };

  window.drawRoute = function drawRouteNative(polyline) {
    call('setMainMapRoute', String(polyline || ''));
    fitCurrentPoints();
  };

  if (typeof previousUpdateQuoteUI === 'function') {
    window.updateQuoteUI = function updateQuoteUIWithNativeGoogle(q, ...rest) {
      const result = previousUpdateQuoteUI.call(this, q, ...rest);
      syncMarkers();
      if (q?.polyline) call('setMainMapRoute', String(q.polyline));
      fitCurrentPoints();
      syncBoundary();
      return result;
    };
  }

  if (typeof previousRenderDriverClient === 'function') {
    window.renderDriverClient = function renderDriverClientWithNativeGoogle(response) {
      const result = previousRenderDriverClient.call(this, response);
      const lat = Number(response?.driver_location?.latitude ?? response?.driver_location?.lat);
      const lng = Number(response?.driver_location?.longitude ?? response?.driver_location?.lng);
      syncMarkers();
      const route = activeRoutePolyline();
      if (route) call('setMainMapRoute', route);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        call('setMainMapDriverLocation', lat, lng);
        const status = String(state?.ride?.status || response?.ride?.status || '');
        const pickup = pickupPoint();
        const now = Date.now();
        if (pickup && ['accepted','driver_arriving'].includes(status) && now - lastApproachFitAt > 12000) {
          lastApproachFitAt = now;
          call(
            'fitMainMapBounds',
            Math.min(pickup.lat, lat),
            Math.min(pickup.lng, lng),
            Math.max(pickup.lat, lat),
            Math.max(pickup.lng, lng),
          );
        }
      }
      return result;
    };
  }

  const scheduleBoundary = () => requestAnimationFrame(syncBoundary);
  window.addEventListener('resize', scheduleBoundary, {passive:true});
  document.addEventListener('pointerdown', scheduleBoundary, true);
  document.addEventListener('pointermove', scheduleBoundary, true);
  document.addEventListener('pointerup', scheduleBoundary, true);
  document.addEventListener('pointercancel', scheduleBoundary, true);

  window.addEventListener('offline', () => {
    setMapStatus('Connexion interrompue — la carte peut cesser de s’actualiser.', 'warn');
  });
  window.addEventListener('online', () => {
    setMapStatus('Connexion rétablie.', 'ok', 2200);
  });
  window.FAST_LOCATION_PERMISSION_CHANGED = granted => {
    if (granted) setMapStatus('Localisation activée.', 'ok', 1800);
    else setMapStatus('Localisation désactivée — saisissez une adresse de départ.', 'warn', 4500);
  };

  const boot = () => {
    installTransparency();
    ensureMapStatus();
    if (!navigator.onLine) setMapStatus('Connexion interrompue — la carte peut cesser de s’actualiser.', 'warn');
    const root = document.getElementById('app') || document.body;
    new MutationObserver(scheduleBoundary).observe(root, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style']});
    syncBoundary();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
