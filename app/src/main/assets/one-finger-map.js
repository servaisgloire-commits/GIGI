/* FAST N°1 — smooth isolated map interaction recovery.
   Only map gestures + address fallback live here. Existing fares, PIN, payment,
   ride, vehicle, notification and ERP settings are intentionally untouched. */
(() => {
  const STYLE_ID = 'fastOneFingerMapStyles';
  const SURFACE_ID = 'fastOneFingerMapSurface';
  const ZOOM_ID = 'fastOneFingerMapZoom';
  const BUFFER_CLASS = 'fast-map-buffer';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #map.fast-one-finger-map{overflow:hidden!important}
      #map.fast-one-finger-map .google-map-frame{
        position:absolute!important;
        width:180%!important;
        height:180%!important;
        left:-40%!important;
        top:-40%!important;
        max-width:none!important;
        max-height:none!important;
        touch-action:none!important;
        transform:translate3d(var(--fast-map-pan-x,0px),var(--fast-map-pan-y,0px),0) scale(var(--fast-map-gesture-scale,1))!important;
        transform-origin:center!important;
        will-change:transform,opacity;
        transition:opacity .12s linear;
        background:#eef3f8;
      }
      #map.fast-one-finger-map .${BUFFER_CLASS}{
        z-index:2!important;
        opacity:0;
        pointer-events:none!important;
        transform:none!important;
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
      #${ZOOM_ID}{
        position:absolute;
        right:14px;
        top:88px;
        z-index:5;
        display:grid;
        gap:7px;
      }
      #${ZOOM_ID} button{
        width:44px;height:44px;border:0;border-radius:13px;background:#fff;color:#0f172a;
        font-size:24px;font-weight:900;box-shadow:0 6px 20px rgba(15,23,42,.18)
      }
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

  function sourceUrl(frame) {
    try { return new URL(frame.dataset.src || frame.src); }
    catch { return null; }
  }

  function centerFromFrame(frame) {
    const url = sourceUrl(frame);
    if (url) {
      const explicit = parseCoord(url.searchParams.get('ll')) || parseCoord(url.searchParams.get('center'));
      if (explicit) return explicit;
      const q = parseCoord(url.searchParams.get('q'));
      if (q) return q;
      const from = parseCoord(url.searchParams.get('saddr'));
      const to = parseCoord(url.searchParams.get('daddr'));
      if (from && to) return {lat:(from.lat + to.lat) / 2, lng:(from.lng + to.lng) / 2};
      if (from || to) return from || to;
    }
    const coords = typeof state !== 'undefined' ? state?.coords : null;
    return coords && Number.isFinite(Number(coords.lat)) && Number.isFinite(Number(coords.lng))
      ? {lat:Number(coords.lat), lng:Number(coords.lng)} : null;
  }

  function zoomFromFrame(frame) {
    const url = sourceUrl(frame);
    const value = Number(url?.searchParams.get('z') || url?.searchParams.get('zoom') || 15);
    return clamp(Number.isFinite(value) ? value : 15, 3, 20);
  }

  function clearGestureTransform(host) {
    host.style.removeProperty('--fast-map-pan-x');
    host.style.removeProperty('--fast-map-pan-y');
    host.style.removeProperty('--fast-map-gesture-scale');
  }

  function viewUrl(frame, center, zoom) {
    const url = sourceUrl(frame);
    if (!url || !center) return null;
    const pair = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
    const hasRoute = url.searchParams.has('saddr') || url.searchParams.has('daddr');
    if (!hasRoute) {
      url.searchParams.delete('q');
      url.searchParams.set('ll', pair);
    } else {
      url.searchParams.set('ll', pair);
    }
    url.searchParams.set('z', String(Math.round(clamp(zoom, 3, 20))));
    return url.toString();
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

  function cloneMapFrame(frame, nextUrl) {
    const buffer = document.createElement('iframe');
    for (const attr of frame.attributes) {
      if (attr.name === 'id' || attr.name === 'src' || attr.name === 'style') continue;
      buffer.setAttribute(attr.name, attr.value);
    }
    buffer.className = `${frame.className} ${BUFFER_CLASS}`.trim();
    buffer.setAttribute('aria-hidden', 'true');
    buffer.src = nextUrl;
    return buffer;
  }

  function smoothTransition(host, frame, stateView, center, zoom) {
    if (!center || stateView.transitioning) return;
    const nextUrl = viewUrl(frame, center, zoom);
    if (!nextUrl) return;

    stateView.center = center;
    stateView.zoom = clamp(zoom, 3, 20);
    stateView.transitioning = true;

    const oldBuffer = host.querySelector(`.${BUFFER_CLASS}`);
    oldBuffer?.remove();
    const buffer = cloneMapFrame(frame, nextUrl);
    host.insertBefore(buffer, document.getElementById(SURFACE_ID) || null);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      frame.style.opacity = '1';
      buffer.remove();
      clearGestureTransform(host);
      stateView.transitioning = false;
    };

    const loadPrimary = () => {
      setTimeout(finish, 140);
    };

    const revealBuffer = () => {
      setTimeout(() => {
        if (!buffer.isConnected) return finish();
        buffer.style.opacity = '1';
        frame.style.opacity = '0';
        clearGestureTransform(host);
        stateView.ignoreSrcMutations += 1;
        frame.addEventListener('load', loadPrimary, {once:true});
        frame.dataset.src = nextUrl;
        frame.src = nextUrl;
        setTimeout(finish, 1600);
      }, 120);
    };

    buffer.addEventListener('load', revealBuffer, {once:true});
    setTimeout(() => {
      if (!buffer.isConnected || buffer.style.opacity === '1') return;
      revealBuffer();
    }, 900);
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
      const center = centerFromFrame(frame) || stateView.center;
      smoothTransition(host, frame, stateView, center, clamp(stateView.zoom + 1, 3, 20));
    };
    buttons[1].onclick = event => {
      event.preventDefault(); event.stopPropagation();
      const center = centerFromFrame(frame) || stateView.center;
      smoothTransition(host, frame, stateView, center, clamp(stateView.zoom - 1, 3, 20));
    };
    return controls;
  }

  function ensureSurface() {
    const host = document.getElementById('map');
    if (!host) return null;
    const frame = host.querySelector('.google-map-frame:not(.fast-map-buffer)');
    if (!frame) return null;

    ensureStyles();
    host.classList.add('fast-one-finger-map');

    let surface = document.getElementById(SURFACE_ID);
    if (surface && surface.parentElement !== host) surface.remove();
    if (surface) return surface;

    const stateView = {
      center: centerFromFrame(frame),
      zoom: zoomFromFrame(frame),
      transitioning: false,
      ignoreSrcMutations: 0,
    };

    surface = document.createElement('div');
    surface.id = SURFACE_ID;
    surface.setAttribute('aria-label', 'Carte FAST manipulable');
    host.appendChild(surface);
    ensureZoom(host, frame, stateView);

    const pointers = new Map();
    let mode = 'idle';
    let primaryId = null;
    let startX = 0;
    let startY = 0;
    let visualX = 0;
    let visualY = 0;
    let pinchStartDistance = 0;
    let pinchScale = 1;
    let pinchStartZoom = stateView.zoom;

    const distanceBetweenPointers = () => {
      const values = [...pointers.values()];
      if (values.length < 2) return 0;
      return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
    };

    const resetGesture = () => {
      mode = 'idle';
      primaryId = null;
      visualX = 0;
      visualY = 0;
      pinchStartDistance = 0;
      pinchScale = 1;
      surface.classList.remove('dragging');
      clearGestureTransform(host);
    };

    const commitPan = () => {
      if (Math.abs(visualX) < 3 && Math.abs(visualY) < 3) return resetGesture();
      const center = panCenter(stateView.center || centerFromFrame(frame), visualX, visualY, stateView.zoom);
      resetGesture();
      if (center) smoothTransition(host, frame, stateView, center, stateView.zoom);
    };

    const commitPinch = () => {
      const ratio = clamp(pinchScale, 0.55, 1.9);
      let delta = Math.round(Math.log2(ratio) * 2);
      if (!delta && ratio > 1.12) delta = 1;
      if (!delta && ratio < 0.88) delta = -1;
      const nextZoom = clamp(pinchStartZoom + delta, 3, 20);
      const center = stateView.center || centerFromFrame(frame);
      resetGesture();
      if (center && nextZoom !== stateView.zoom) smoothTransition(host, frame, stateView, center, nextZoom);
    };

    surface.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
      try { surface.setPointerCapture(event.pointerId); } catch {}

      stateView.center = centerFromFrame(frame) || stateView.center;
      stateView.zoom = zoomFromFrame(frame) || stateView.zoom;

      if (pointers.size === 1) {
        mode = 'pan';
        primaryId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        visualX = 0;
        visualY = 0;
        surface.classList.add('dragging');
      } else if (pointers.size === 2) {
        mode = 'pinch';
        pinchStartDistance = distanceBetweenPointers() || 1;
        pinchStartZoom = stateView.zoom;
        pinchScale = 1;
        visualX = 0;
        visualY = 0;
        host.style.removeProperty('--fast-map-pan-x');
        host.style.removeProperty('--fast-map-pan-y');
      }
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    surface.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});

      if (mode === 'pinch' && pointers.size >= 2) {
        const currentDistance = distanceBetweenPointers();
        pinchScale = clamp(currentDistance / Math.max(1, pinchStartDistance), 0.72, 1.45);
        host.style.setProperty('--fast-map-gesture-scale', String(pinchScale));
      } else if (mode === 'pan' && event.pointerId === primaryId) {
        const maxX = Math.max(70, host.clientWidth * 0.32);
        const maxY = Math.max(100, host.clientHeight * 0.32);
        visualX = clamp(event.clientX - startX, -maxX, maxX);
        visualY = clamp(event.clientY - startY, -maxY, maxY);
        host.style.setProperty('--fast-map-pan-x', `${visualX}px`);
        host.style.setProperty('--fast-map-pan-y', `${visualY}px`);
      }
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    const finishPointer = event => {
      if (!pointers.has(event.pointerId)) return;
      const wasPinch = mode === 'pinch';
      pointers.delete(event.pointerId);
      try { surface.releasePointerCapture(event.pointerId); } catch {}

      if (wasPinch) {
        pointers.clear();
        commitPinch();
      } else if (mode === 'pan' && event.pointerId === primaryId) {
        pointers.clear();
        commitPan();
      }
      event.preventDefault();
      event.stopPropagation();
    };

    surface.addEventListener('pointerup', finishPointer, {passive:false});
    surface.addEventListener('pointercancel', finishPointer, {passive:false});

    surface.addEventListener('wheel', event => {
      const center = centerFromFrame(frame) || stateView.center;
      const nextZoom = clamp(stateView.zoom + (event.deltaY < 0 ? 1 : -1), 3, 20);
      if (center) smoothTransition(host, frame, stateView, center, nextZoom);
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    let lastTapAt = 0;
    surface.addEventListener('click', event => {
      const now = Date.now();
      if (now - lastTapAt < 320) {
        const center = centerFromFrame(frame) || stateView.center;
        if (center) smoothTransition(host, frame, stateView, center, clamp(stateView.zoom + 1, 3, 20));
        lastTapAt = 0;
      } else {
        lastTapAt = now;
      }
      event.preventDefault();
    });

    const srcObserver = new MutationObserver(() => {
      if (stateView.ignoreSrcMutations > 0) {
        stateView.ignoreSrcMutations -= 1;
        return;
      }
      stateView.center = centerFromFrame(frame) || stateView.center;
      stateView.zoom = zoomFromFrame(frame) || stateView.zoom;
      host.querySelector(`.${BUFFER_CLASS}`)?.remove();
      frame.style.opacity = '1';
      stateView.transitioning = false;
      resetGesture();
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
