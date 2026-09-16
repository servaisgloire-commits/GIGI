/* FAST N°1 — isolated draggable client destination sheet. */
(() => {
  const STYLE_ID = 'fastClientSheetDragStyles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #clientHome.fast-client-sheet-drag{
        --fast-client-sheet-y:0px;
        transform:translateY(var(--fast-client-sheet-y));
        will-change:transform;
      }
      #clientHome.fast-client-sheet-drag.fast-sheet-settling{transition:transform .22s cubic-bezier(.2,.8,.2,1)}
      #clientHome.fast-client-sheet-drag .sheet-handle{touch-action:none;cursor:grab}
      #clientHome.fast-client-sheet-drag.fast-sheet-dragging .sheet-handle{cursor:grabbing}
      #clientHome.fast-client-sheet-drag .sheet-title{touch-action:pan-x}
      @media(min-width:700px){
        #clientHome.fast-client-sheet-drag{transform:translate(-50%,var(--fast-client-sheet-y))}
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    const sheet = document.getElementById('clientHome');
    if (!sheet || sheet.dataset.fastSheetDrag === '1') return;
    ensureStyles();
    sheet.dataset.fastSheetDrag = '1';
    sheet.classList.add('fast-client-sheet-drag');

    let pointerId = null;
    let startY = 0;
    let startOffset = 0;
    let currentOffset = 0;
    let maxOffset = 0;
    let lastY = 0;
    let lastAt = 0;
    let velocity = 0;
    let moved = false;
    let suppressHandleClick = false;

    const calcMax = () => {
      const visibleMin = 92;
      maxOffset = Math.max(0, Math.min(sheet.scrollHeight - visibleMin, window.innerHeight * 0.48));
      currentOffset = Math.min(currentOffset, maxOffset);
      return maxOffset;
    };

    const apply = value => {
      currentOffset = Math.max(0, Math.min(calcMax(), value));
      sheet.style.setProperty('--fast-client-sheet-y', `${currentOffset}px`);
      sheet.setAttribute('aria-expanded', currentOffset < maxOffset * 0.45 ? 'true' : 'false');
    };

    const reset = () => {
      pointerId = null;
      startOffset = 0;
      currentOffset = 0;
      velocity = 0;
      moved = false;
      sheet.classList.remove('fast-sheet-dragging','fast-sheet-settling');
      sheet.style.setProperty('--fast-client-sheet-y','0px');
      sheet.setAttribute('aria-expanded','true');
    };
    window.FAST_RESET_CLIENT_SHEET = reset;

    const isDragZone = target => {
      if (!(target instanceof Element)) return false;
      if (target.closest('button,input,select,textarea,a')) return false;
      return !!target.closest('.sheet-handle,.sheet-title');
    };

    sheet.addEventListener('pointerdown', event => {
      if (!isDragZone(event.target)) return;
      pointerId = event.pointerId;
      startY = event.clientY;
      startOffset = currentOffset;
      lastY = event.clientY;
      lastAt = performance.now();
      velocity = 0;
      moved = false;
      sheet.classList.remove('fast-sheet-settling');
      sheet.classList.add('fast-sheet-dragging');
      try { sheet.setPointerCapture(pointerId); } catch {}
      event.preventDefault();
    }, {passive:false});

    sheet.addEventListener('pointermove', event => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastAt);
      velocity = (event.clientY - lastY) / dt;
      lastY = event.clientY;
      lastAt = now;
      if (Math.abs(event.clientY - startY) > 6) moved = true;
      apply(startOffset + (event.clientY - startY));
      event.preventDefault();
    }, {passive:false});

    const finish = event => {
      if (pointerId === null || (event && event.pointerId !== pointerId)) return;
      try { sheet.releasePointerCapture(pointerId); } catch {}
      pointerId = null;
      sheet.classList.remove('fast-sheet-dragging');
      sheet.classList.add('fast-sheet-settling');
      calcMax();

      const stops = [0, maxOffset * 0.55, maxOffset];
      let target = stops.reduce((best, stop) => Math.abs(stop - currentOffset) < Math.abs(best - currentOffset) ? stop : best, stops[0]);
      if (velocity > 0.45) target = currentOffset < maxOffset * 0.6 ? maxOffset * 0.55 : maxOffset;
      if (velocity < -0.45) target = currentOffset > maxOffset * 0.45 ? maxOffset * 0.55 : 0;
      apply(target);
      suppressHandleClick = moved;
      setTimeout(() => { suppressHandleClick = false; }, 0);
      setTimeout(() => sheet.classList.remove('fast-sheet-settling'), 260);
      event?.preventDefault?.();
    };

    sheet.addEventListener('pointerup', finish, {passive:false});
    sheet.addEventListener('pointercancel', finish, {passive:false});

    sheet.querySelector('.sheet-handle')?.addEventListener('click', event => {
      if (suppressHandleClick) {
        event.preventDefault();
        return;
      }
      sheet.classList.add('fast-sheet-settling');
      calcMax();
      apply(currentOffset < maxOffset * 0.35 ? maxOffset : 0);
      setTimeout(() => sheet.classList.remove('fast-sheet-settling'), 260);
    });

    window.addEventListener('resize', () => apply(currentOffset));
    document.addEventListener('fast:client-sheet-reset', reset);
    apply(0);
  }

  function boot() {
    install();
    const root = document.getElementById('app') || document.body;
    new MutationObserver(install).observe(root, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
