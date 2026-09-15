/* FAST N°1 — continuous Google Maps surface for the WebView.
   Replaces the embedded iframe presentation only. Ride, fare, PIN, payment,
   cancellation, vehicle and ERP rules remain untouched. */
(() => {
  const previousInitMap = window.initMap;
  const previousUpdateQuoteUI = window.updateQuoteUI;
  const previousRenderDriverClient = window.renderDriverClient;
  const previousDetailsFor = window.detailsFor;

  let googlePromise = null;
  let liveMap = null;
  let routeLine = null;
  let driverLiveMarker = null;
  const nearbyMarkers = [];

  const point = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
    ? {lat:Number(value.lat), lng:Number(value.lng)} : null;

  function mapsKey() {
    try {
      return String(window.FastNative?.googleMapsApiKey?.() || '').trim();
    } catch {
      return '';
    }
  }

  function loadGoogleMaps() {
    if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
    if (googlePromise) return googlePromise;

    googlePromise = new Promise((resolve, reject) => {
      const key = mapsKey();
      if (!key) return reject(new Error('Google Maps key unavailable'));

      const callbackName = '__fastLiveGoogleMapsReady';
      const previousCallback = window[callbackName];
      window[callbackName] = () => {
        try { previousCallback?.(); } catch {}
        resolve(window.google.maps);
      };

      const existing = document.querySelector('script[data-fast-live-google-maps]');
      if (existing) return;

      const script = document.createElement('script');
      script.dataset.fastLiveGoogleMaps = '1';
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=geometry&callback=${callbackName}`;
      script.onerror = () => reject(new Error('Google Maps failed to load'));
      document.head.appendChild(script);
    });
    return googlePromise;
  }

  function cleanLegacyMapArtifacts(host) {
    document.getElementById('fastOneFingerMapSurface')?.remove();
    document.getElementById('fastOneFingerMapZoom')?.remove();
    document.getElementById('driverMapTouchSurface')?.classList.add('hidden');
    host.classList.remove('fast-one-finger-map');
    host.style.removeProperty('--fast-one-finger-x');
    host.style.removeProperty('--fast-one-finger-y');
    host.style.removeProperty('--fast-one-finger-scale');
    host.style.removeProperty('--fast-driver-pan-x');
    host.style.removeProperty('--fast-driver-pan-y');
    host.querySelectorAll('.google-map-frame,.google-map-badge,.fast-map-loading').forEach(node => node.remove());
  }

  function mapCenter() {
    return point(state?.coords) || point(state?.pickup) || {lat:-4.2634,lng:15.2429};
  }

  function makeCompatMap(map) {
    return {
      provider: 'google-live',
      gmap: map,
      setView(coords, zoom) {
        const p = Array.isArray(coords)
          ? {lat:Number(coords[0]), lng:Number(coords[1])}
          : point(coords);
        if (p) map.panTo(p);
        if (zoom != null && Number.isFinite(Number(zoom))) map.setZoom(Number(zoom));
        return this;
      },
      fitBounds(bounds, options = {}) {
        if (!bounds) return this;
        if (bounds instanceof google.maps.LatLngBounds) {
          map.fitBounds(bounds, options.padding || 55);
          return this;
        }
        const rows = Array.isArray(bounds) ? bounds : [];
        const box = new google.maps.LatLngBounds();
        rows.forEach(row => {
          const p = Array.isArray(row) ? {lat:Number(row[0]),lng:Number(row[1])} : point(row);
          if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) box.extend(p);
        });
        if (!box.isEmpty()) map.fitBounds(box, options.padding || 55);
        return this;
      },
      removeLayer(layer) {
        try { layer?.setMap?.(null); } catch {}
        return this;
      },
      resize() {
        try { google.maps.event.trigger(map, 'resize'); } catch {}
        return this;
      },
    };
  }

  function markerIcon(color, scale = 7) {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    };
  }

  function placeLiveMarker(kind, coords) {
    if (!liveMap || !point(coords)) return;
    const key = kind === 'pickup' ? 'pickupMarker' : 'destinationMarker';
    try { state[key]?.setMap?.(null); } catch {}
    state[key] = new google.maps.Marker({
      map: liveMap,
      position: point(coords),
      icon: markerIcon(kind === 'pickup' ? '#0b57d0' : '#111827'),
      zIndex: 30,
    });
    fitLiveMap();
  }

  function fitLiveMap() {
    if (!liveMap) return;
    const points = [point(state?.pickup), point(state?.destination)].filter(Boolean);
    if (routeLine?.getPath?.().getLength?.() > 1) {
      const box = new google.maps.LatLngBounds();
      routeLine.getPath().forEach(p => box.extend(p));
      liveMap.fitBounds(box, 58);
      return;
    }
    if (points.length === 1) {
      liveMap.panTo(points[0]);
      liveMap.setZoom(15);
    } else if (points.length > 1) {
      const box = new google.maps.LatLngBounds();
      points.forEach(p => box.extend(p));
      liveMap.fitBounds(box, 58);
    }
  }

  function decodePolyline(encoded) {
    const coordinates = [];
    let index = 0, lat = 0, lng = 0;
    while (index < String(encoded || '').length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coordinates.push({lat:lat / 1e5, lng:lng / 1e5});
    }
    return coordinates;
  }

  function drawLiveRoute(polyline) {
    if (!liveMap || !polyline) return;
    try { routeLine?.setMap?.(null); } catch {}
    routeLine = null;
    try {
      const path = decodePolyline(polyline);
      if (path.length < 2) return fitLiveMap();
      routeLine = new google.maps.Polyline({
        map: liveMap,
        path,
        strokeColor: '#0b57d0',
        strokeOpacity: .92,
        strokeWeight: 6,
        geodesic: false,
        zIndex: 20,
      });
      fitLiveMap();
    } catch {
      fitLiveMap();
    }
  }

  function clearNearbyLive() {
    nearbyMarkers.splice(0).forEach(marker => {
      try { marker.setMap(null); } catch {}
    });
    state.driverMarkers = [];
  }

  function drawNearbyLive(items) {
    clearNearbyLive();
    if (!liveMap) return;
    (items || []).forEach(item => {
      const p = point(item);
      if (!p) return;
      const marker = new google.maps.Marker({
        map: liveMap,
        position: p,
        label: {text:'F', color:'#ffffff', fontWeight:'900', fontSize:'11px'},
        icon: markerIcon('#0b57d0', 12),
        zIndex: 25,
      });
      nearbyMarkers.push(marker);
    });
    state.driverMarkers = nearbyMarkers;
  }

  function updateDriverLive(location) {
    const lat = Number(location?.latitude ?? location?.lat);
    const lng = Number(location?.longitude ?? location?.lng);
    if (!liveMap || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = {lat,lng};
    if (!driverLiveMarker) {
      driverLiveMarker = new google.maps.Marker({
        map: liveMap,
        position: pos,
        label: {text:'F', color:'#ffffff', fontWeight:'900', fontSize:'11px'},
        icon: markerIcon('#0b57d0', 13),
        zIndex: 40,
      });
    } else {
      driverLiveMarker.setPosition(pos);
      driverLiveMarker.setMap(liveMap);
    }
  }

  async function initLiveMap() {
    const host = document.getElementById('map');
    if (!host) return;
    if (liveMap && state?.map?.provider === 'google-live') {
      requestAnimationFrame(() => google.maps.event.trigger(liveMap, 'resize'));
      return;
    }

    await loadGoogleMaps();
    cleanLegacyMapArtifacts(host);
    host.innerHTML = '';

    liveMap = new google.maps.Map(host, {
      center: mapCenter(),
      zoom: 15,
      disableDefaultUI: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: false,
      scaleControl: false,
      zoomControl: true,
      clickableIcons: false,
      keyboardShortcuts: false,
      gestureHandling: 'greedy',
      backgroundColor: '#eef3f8',
    });

    state.map = makeCompatMap(liveMap);
    if (point(state?.pickup)) placeLiveMarker('pickup', state.pickup);
    if (point(state?.destination)) placeLiveMarker('destination', state.destination);
    if (state?.quote?.polyline) drawLiveRoute(state.quote.polyline);

    requestAnimationFrame(() => google.maps.event.trigger(liveMap, 'resize'));
  }

  window.initMap = function initMapContinuousGoogle() {
    initLiveMap().catch(error => {
      console.warn('FAST live Google Maps fallback', error?.message || error);
      if (typeof previousInitMap === 'function') previousInitMap();
    });
  };

  window.placeMarker = function placeMarkerContinuousGoogle(kind, coords) {
    if (!liveMap) {
      window.initMap();
      return setTimeout(() => placeLiveMarker(kind, coords), 350);
    }
    placeLiveMarker(kind, coords);
  };

  window.fitMap = fitLiveMap;
  window.clearDriverMarkers = clearNearbyLive;
  window.drawNearby = drawNearbyLive;
  window.drawRoute = drawLiveRoute;

  if (typeof previousUpdateQuoteUI === 'function') {
    window.updateQuoteUI = function updateQuoteUIWithContinuousMap(q, ...rest) {
      const result = previousUpdateQuoteUI.call(this, q, ...rest);
      if (q?.polyline) drawLiveRoute(q.polyline);
      else fitLiveMap();
      return result;
    };
  }

  if (typeof previousRenderDriverClient === 'function') {
    window.renderDriverClient = function renderDriverClientWithContinuousMap(response) {
      const result = previousRenderDriverClient.call(this, response);
      updateDriverLive(response?.driver_location);
      return result;
    };
  }

  function installAddressFallback() {
    const original = previousDetailsFor || window.detailsFor;
    if (typeof original !== 'function' || window.detailsFor?.fastContinuousAddressFallback) return;

    async function fallbackCoordinates(label) {
      const query = String(label || '').trim();
      if (!query) return null;
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`, {
          headers: {Accept:'application/json'}, cache:'no-store',
        });
        if (response.ok) {
          const rows = await response.json();
          const row = Array.isArray(rows) ? rows[0] : null;
          if (row && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
            return {lat:Number(row.lat), lng:Number(row.lon), label:row.display_name || query};
          }
        }
      } catch {}
      return null;
    }

    const wrapped = async function detailsForContinuousMap(item) {
      try {
        const result = await original(item);
        if (result?.lat != null && result?.lng != null) return result;
      } catch (error) {
        const fallback = await fallbackCoordinates(item?.label);
        if (fallback) return {...fallback, id:item?.id || null};
        throw error;
      }
      const fallback = await fallbackCoordinates(item?.label);
      if (fallback) return {...fallback, id:item?.id || null};
      throw new Error('Adresse introuvable.');
    };
    wrapped.fastContinuousAddressFallback = true;
    window.detailsFor = wrapped;
  }

  installAddressFallback();
  document.addEventListener('DOMContentLoaded', () => {
    installAddressFallback();
    document.getElementById('fastOneFingerMapStyles')?.remove();
  }, {once:true});
})();
