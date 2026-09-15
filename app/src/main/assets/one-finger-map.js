/* FAST N°1 — isolated one-finger map interaction for embedded client/driver maps. */
(() => {
  const STYLE_ID = 'fastOneFingerMapStyles';
  const SURFACE_ID = 'fastOneFingerMapSurface';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #map.fast-one-finger-map .google-map-frame{
        touch-action:none!important;
        transform:translate3d(var(--fast-one-finger-x,0px),var(--fast-one-finger-y,0px),0) scale(1.22)!important;
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
      }
      #${SURFACE_ID}.dragging{cursor:grabbing}
      .driver-native-map-active #${SURFACE_ID}{display:none!important;pointer-events:none!important}
      .client-route-dismissed #${SURFACE_ID}{display:none!important;pointer-events:none!important}
    `;
    document.head.appendChild(style);
  }

  function resetPan(host) {
    host.style.removeProperty('--fast-one-finger-x');
    host.style.removeProperty('--fast-one-finger-y');
    host.dataset.fastPanX = '0';
    host.dataset.fastPanY = '0';
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

    surface = document.createElement('div');
    surface.id = SURFACE_ID;
    surface.setAttribute('aria-label', 'Carte FAST manipulable à un doigt');
    host.appendChild(surface);

    let dragging = false;
    let pointerId = null;
    let lastX = 0;
    let lastY = 0;

    const finish = event => {
      if (!dragging) return;
      if (event && pointerId !== null && event.pointerId !== pointerId) return;
      dragging = false;
      surface.classList.remove('dragging');
      if (pointerId !== null) {
        try { surface.releasePointerCapture(pointerId); } catch {}
      }
      pointerId = null;
      event?.preventDefault?.();
      event?.stopPropagation?.();
    };

    surface.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragging = true;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      surface.classList.add('dragging');
      try { surface.setPointerCapture(pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    surface.addEventListener('pointermove', event => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      const currentX = Number(host.dataset.fastPanX || 0);
      const currentY = Number(host.dataset.fastPanY || 0);
      const maxX = Math.max(32, host.clientWidth * 0.09);
      const maxY = Math.max(44, host.clientHeight * 0.09);
      const nextX = Math.max(-maxX, Math.min(maxX, currentX + dx));
      const nextY = Math.max(-maxY, Math.min(maxY, currentY + dy));

      host.dataset.fastPanX = String(nextX);
      host.dataset.fastPanY = String(nextY);
      host.style.setProperty('--fast-one-finger-x', `${nextX}px`);
      host.style.setProperty('--fast-one-finger-y', `${nextY}px`);
      event.preventDefault();
      event.stopPropagation();
    }, {passive:false});

    surface.addEventListener('pointerup', finish, {passive:false});
    surface.addEventListener('pointercancel', finish, {passive:false});

    const srcObserver = new MutationObserver(() => resetPan(host));
    srcObserver.observe(frame, {attributes:true, attributeFilter:['src']});
    return surface;
  }

  function boot() {
    ensureStyles();
    ensureSurface();
    const root = document.getElementById('app') || document.body;
    const observer = new MutationObserver(() => ensureSurface());
    observer.observe(root, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
