/* FAST N°1 — isolated map interaction recovery. No fares, PIN, payment, ride, vehicle or ERP settings are changed here. */
(() => {
  const STYLE_ID = 'fastOneFingerMapStyles';
  const SURFACE_ID = 'fastOneFingerMapSurface';
  const ZOOM_ID = 'fastOneFingerMapZoom';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #map.fast-one-finger-map{overflow:hidden!important}
      #map.fast-one-finger-map .google-map-frame{
        position:absolute!important;
        width:160%!important;
        height:160%!important;
        left:-30%!important;
        top:-30%!important;
        max-width:none!important;
        max-height:none!important;
        touch-action:none!important;
        transform:translate3d(var(--fast-one-finger-x,0px),var(--fast-one-finger-y,0px),0)!important;
        transform-origin:center!important;
        will-change:transform;
      }
      #${SURFACE_ID}{
        position:absolute;
        inset:0;
        z-index:3;
        display:block;
        touch-action:none;
        overscroll-behavior:none;
        background:transparent;
        -webkit-user-select:none;
        user-select:none;
        cursor:grab;
      }
      #${SURFACE_ID}.dragging{cursor:grabbing}
      #${ZOOM_ID}{position:absolute;right:14px;bottom:190px;z-index:4;display:grid;gap:6px}
      #${ZOOM_ID} button{width:44px;height:44px;border:0;border-radius:12px;background:#fff;color:#0f172a;font-size:24px;font-weight:900;box-shadow:0 6px 20px rgba(15,23,42,.18)}
      .driver-native-map-active #${SURFACE_ID},.driver-native-map-active #${ZOOM_ID}{display:none!important;pointer-events:none!important}
      .client-route-dismissed #${SURFACE_ID},.client-route-dismissed #${ZOOM_ID}{display:none!important;pointer-events:none!important}
    `;
    document.head.appendChild(style);
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function parseCoord(value) {
    const match = String(value || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? {lat, lng} : null;
  }

  function centerFromFrame(frame) {
    try {
      const url = new URL(frame.dataset.src || frame.src);
      const explicit = parseCoord(url.searchParams.get('ll')) || parseCoord(url.searchParams.get('center'));
      if (explicit) return explicit;
      const q = parseCoord(url.searchParams.get('q'));
      if (q) return q;
      const from = parseCoord(url.searchParams.get('saddr'));
      const to = parseCoord(url.searchParams.get('daddr'));
      if (from && to) return {lat:(from.lat + to.lat) / 2, lng:(from.lng + to.lng) / 2};
      return from || to || (state?.coords ? {lat:Number(state.coords.lat), lng:Number(state.coords.lng)} : null);
    } catch {
      return state?.coords ? {lat:Number(state.coords.lat), lng:Number(state.coords.lng)} : null;
    }
  }

  function zoomFromFrame(frame) {
    try {
      const url = new URL(frame.dataset.src || frame.src);
      const value = Number(url.searchParams.get('z') || url.searchParams.get('zoom') || 15);
      return clamp(Number.isFinite(value) ? value : 15, 3, 20);
    } catch {
      return 15;
    }
  }

  function resetVisualPan(host) {
    host.style.removeProperty('--fast-one-finger-x');
    host.style.removeProperty('--fast-one-finger-y');
  }

  function updateFrameView(frame, center, zoom) {
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    try {
      const url = new URL(frame.dataset.src || frame.src);
      url.searchParams.set('ll', `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`);
      url.searchParams.set('z', String(Math.round(clamp(zoom, 3, 20))));
      const next = url.toString();
      frame.dataset.fastManualView = '1';
      frame.dataset.src = next;
      frame.src = next;
    } catch {}
  }

  function panCenter(center, dx, dy, zoom) {
    if (!center) return null;
    const latRad = center.lat * Math.PI / 180;
    const metersPerPixel = 156543.03392 * Math.max(0.12, Math.cos(latRad)) / Math.pow(2, zoom);
    const dLat = (dy * metersPerPixel) / 110540;
    const lngMeters = Math.max(12000, 111320 * Math.max(0.12, Math.cos(latRad)));
    const dLng = (-dx * metersPerPixel) / lngMeters;
    return {
      lat: clamp(center.lat + dLat, -85, 85),
      lng: ((center.lng + dLng + 540) % 360) - 180,
    };
  }

  function ensureZoom(host, frame, stateView) {
    let controls = document.getElementById(ZOOM_ID);
    if (controls && controls.parentElement !== host) controls.remove();
    if (controls) return controls;
    controls = document.createElement('div');
    controls.id = ZOOM_ID;
    controls.innerHTML = '<button type="button" aria-label="Zoomer">+</button><button type="button" aria-label="Dézoomer">−</button>';
    host.appendChild(controls);
    const buttons = controls.querySelectorAll('button');
    buttons[0].onclick = event => {
      event.preventDefault(); event.stopPropagation();
      stateView.zoom = clamp(stateView.zoom + 1, 3, 20);
      updateFrameView(frame, stateView.center, stateView.zoom);
    };
    buttons[1].onclick = event => {
      event.preventDefault(); event.stopPropagation();
      stateView.zoom = clamp(stateView.zoom - 1, 3, 20);
      updateFrameView(frame, stateView.center, stateView.zoom);
    };
    return controls;
  }

  function ensureSurface() {
    const host = document.getElementById('map');
    if (!host) return null;
    const frame = host.querySelector('.google-map-frame');
    if (!frame) return null;

    ensureStyles();
    host.classList.add('fast-one-finger-map');

    let surface = document.getElementById(SURFACE_ID);
    if (surface && surface.parentElement !== host) surface.remove();
    if (surface) return surface;

    const stateView = {
      center: centerFromFrame(frame),
      zoom: zoomFromFrame(frame),
    };

    surface = document.createElement('div');
    surface.id = SURFACE_ID;
    surface.setAttribute('aria-label', 'Carte FAST manipulable à un doigt');
    host.appendChild(surface);
    ensureZoom(host, frame, stateView);

    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let visualX = 0;
    let visualY = 0;

    const commitPan = event => {
      if (!dragging) return;
      if (event && pointerId !== null && event.pointerId !== pointerId) return;
      dragging = false;
      surface.classList.remove('dragging');
      if (pointerId !== null) {
        try { surface.releasePointerCapture(pointerId); } catch {}
      }
      pointerId = null;
      if (Math.abs(visualX) > 2 || Math.abs(visualY) > 2) {
        stateView.center = panCenter(stateView.center || centerFromFrame(frame), visualX, visualY, stateView.zoom);
        updateFrameView(frame, stateView.center, stateView.zoom);
      }
      visualX = 0;
      visualY = 0;
      resetVisualPan(host);
      event?.preventDefault?.();
      event?.stopPropagation?.();
    };

    surface.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      visualX = 0;
      visualY = 0;
      stateView.center = centerFromFrame(frame) || stateView.center;
      stateView.zoom = zoomFromFrame(frame) || stateView.zoom;
      surface.classList.add('dragging');
      try { surface.setPointerCapture(pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    surface.addEventListener('pointermove', event => {
      if (!dragging || event.pointerId !== pointerId) return;
      visualX = event.clientX - startX;
      visualY = event.clientY - startY;
      host.style.setProperty('--fast-one-finger-x', `${visualX}px`);
      host.style.setProperty('--fast-one-finger-y', `${visualY}px`);
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    surface.addEventListener('pointerup', commitPan, {passive:false});
    surface.addEventListener('pointercancel', commitPan, {passive:false});
    surface.addEventListener('wheel', event => {
      stateView.zoom = clamp(stateView.zoom + (event.deltaY < 0 ? 1 : -1), 3, 20);
      stateView.center = centerFromFrame(frame) || stateView.center;
      updateFrameView(frame, stateView.center, stateView.zoom);
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    const srcObserver = new MutationObserver(() => {
      if (frame.dataset.fastManualView === '1') {
        delete frame.dataset.fastManualView;
      }
      stateView.center = centerFromFrame(frame) || stateView.center;
      stateView.zoom = zoomFromFrame(frame) || stateView.zoom;
      resetVisualPan(host);
    });
    srcObserver.observe(frame, {attributes:true, attributeFilter:['src']});
    return surface;
  }

  function installAddressFallback() {
    const original = window.detailsFor;
    if (typeof original !== 'function' || original.fastAddressFallback) return;

    async function fallbackCoordinates(label) {
      const query = String(label || '').trim();
      if (!query) return null;
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`, {
          headers: {Accept:'application/json'},
          cache: 'no-store',
        });
        if (response.ok) {
          const rows = await response.json();
          const row = Array.isArray(rows) ? rows[0] : null;
          if (row && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
            return {lat:Number(row.lat), lng:Number(row.lon), label:row.display_name || query};
          }
        }
      } catch {}
      try {
        const response = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`, {cache:'no-store'});
        if (response.ok) {
          const data = await response.json();
          const feature = data?.features?.[0];
          const coords = feature?.geometry?.coordinates;
          if (Array.isArray(coords) && Number.isFinite(Number(coords[1])) && Number.isFinite(Number(coords[0]))) {
            const p = feature.properties || {};
            const labelParts = [p.name,p.street,p.city,p.state,p.country].filter(Boolean);
            return {lat:Number(coords[1]), lng:Number(coords[0]), label:labelParts.join(', ') || query};
          }
        }
      } catch {}
      return null;
    }

    const wrapped = async function detailsForWithFallback(item) {
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
    wrapped.fastAddressFallback = true;
    window.detailsFor = wrapped;
  }

  function boot() {
    ensureStyles();
    installAddressFallback();
    ensureSurface();
    const root = document.getElementById('app') || document.body;
    const observer = new MutationObserver(() => {
      installAddressFallback();
      ensureSurface();
    });
    observer.observe(root, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
