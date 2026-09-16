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
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('fast-native-main-map');
  }

  function centerPoint() {
    return point(state?.coords) || point(state?.pickup) || {lat:-4.2634,lng:15.2429};
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
    const pickup = point(state?.pickup);
    const destination = point(state?.destination);
    call(
      'setMainMapMarkers',
      !!pickup, pickup?.lat || 0, pickup?.lng || 0,
      !!destination, destination?.lat || 0, destination?.lng || 0,
    );
  }

  function fitCurrentPoints() {
    const pts = [point(state?.pickup), point(state?.destination)].filter(Boolean);
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
    if (state?.quote?.polyline) call('setMainMapRoute', String(state.quote.polyline));
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
      if (Number.isFinite(lat) && Number.isFinite(lng)) call('setMainMapDriverLocation', lat, lng);
      return result;
    };
  }

  const scheduleBoundary = () => requestAnimationFrame(syncBoundary);
  window.addEventListener('resize', scheduleBoundary, {passive:true});
  document.addEventListener('pointerdown', scheduleBoundary, true);
  document.addEventListener('pointermove', scheduleBoundary, true);
  document.addEventListener('pointerup', scheduleBoundary, true);
  document.addEventListener('pointercancel', scheduleBoundary, true);

  const boot = () => {
    installTransparency();
    const root = document.getElementById('app') || document.body;
    new MutationObserver(scheduleBoundary).observe(root, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style']});
    syncBoundary();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
