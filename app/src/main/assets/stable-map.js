/* FAST N°1 — stable continuous map surface.
   This layer only replaces the broken embedded/WebView map presentation.
   Ride, fare, PIN, payment, cancellation, vehicle and ERP rules stay untouched. */
(() => {
  const TILE_SIZE = 256;
  const MIN_ZOOM = 3;
  const MAX_ZOOM = 19;
  const DEFAULT_CENTER = {lat:-4.2634, lng:15.2429};
  let stableMap = null;
  let routeCoords = [];
  let liveDriver = null;
  let nearby = [];
  const markers = {pickup:null, destination:null};

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const point = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))
    ? {lat:Number(value.lat), lng:Number(value.lng)} : null;

  function injectStyles() {
    if (document.getElementById('fastStableMapStyles')) return;
    const style = document.createElement('style');
    style.id = 'fastStableMapStyles';
    style.textContent = `
      #map.fast-stable-map{overflow:hidden;background:#e9f0f7;touch-action:none;user-select:none;-webkit-user-select:none;overscroll-behavior:none}
      #map .fast-map-tiles,#map .fast-map-overlay{position:absolute;inset:0;overflow:hidden;pointer-events:none}
      #map .fast-map-tile{position:absolute;width:256px;height:256px;max-width:none;pointer-events:none;-webkit-user-drag:none;user-select:none;opacity:0;transition:opacity .12s linear;background:#e9f0f7}
      #map .fast-map-tile.loaded{opacity:1}
      #map .fast-map-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
      #map .fast-map-route{fill:none;stroke:#0b57d0;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 2px 2px rgba(0,0,0,.16))}
      #map .fast-map-marker{position:absolute;transform:translate(-50%,-50%);display:grid;place-items:center;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.25);font-weight:900;z-index:6;pointer-events:none}
      #map .fast-map-marker.pickup{width:22px;height:22px;background:#0b57d0}
      #map .fast-map-marker.destination{width:22px;height:22px;background:#111827}
      #map .fast-map-marker.driver{width:35px;height:35px;background:#0b57d0;color:#fff;font-size:12px}
      #map .fast-map-zoom{position:absolute;right:14px;bottom:126px;z-index:8;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,.18);background:#fff}
      #map .fast-map-zoom button{width:44px;height:44px;border:0;background:#fff;color:#111827;font-size:25px;font-weight:700;padding:0;touch-action:manipulation}
      #map .fast-map-zoom button+button{border-top:1px solid #e5e7eb}
      #map .fast-map-attribution{position:absolute;left:8px;bottom:7px;z-index:7;background:rgba(255,255,255,.9);border-radius:5px;padding:2px 5px;font-size:9px;color:#475569;pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function project(lat, lng, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const safeLat = clamp(Number(lat), -85.05112878, 85.05112878);
    const sin = Math.sin(safeLat * Math.PI / 180);
    return {
      x: (Number(lng) + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  }

  function unproject(x, y, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const lng = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return {lat:clamp(lat,-85.05112878,85.05112878), lng:((lng + 540) % 360) - 180};
  }

  function decodePolyline(encoded) {
    const coordinates = [];
    let index = 0, lat = 0, lng = 0;
    const text = String(encoded || '');
    while (index < text.length) {
      let b, shift = 0, result = 0;
      do { b = text.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && index <= text.length);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = text.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && index <= text.length);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coordinates.push({lat:lat / 1e5, lng:lng / 1e5});
    }
    return coordinates;
  }

  class StableMap {
    constructor(host) {
      this.host = host;
      this.center = point(state?.coords) || point(state?.pickup) || DEFAULT_CENTER;
      this.zoom = 15;
      this.tiles = new Map();
      this.activePointers = new Map();
      this.dragPointer = null;
      this.lastPoint = null;
      this.pinchDistance = 0;
      this.lastTap = 0;
      this.frame = 0;
      this.destroyed = false;
      this.prepare();
      this.bindGestures();
      this.render();
    }

    prepare() {
      injectStyles();
      this.host.innerHTML = '';
      this.host.classList.remove('fast-one-finger-map');
      this.host.classList.add('fast-stable-map');
      this.tileLayer = document.createElement('div');
      this.tileLayer.className = 'fast-map-tiles';
      this.overlay = document.createElement('div');
      this.overlay.className = 'fast-map-overlay';
      this.svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      this.svg.setAttribute('class','fast-map-svg');
      this.routePath = document.createElementNS('http://www.w3.org/2000/svg','polyline');
      this.routePath.setAttribute('class','fast-map-route');
      this.svg.appendChild(this.routePath);
      this.overlay.appendChild(this.svg);
      this.zoomBox = document.createElement('div');
      this.zoomBox.className = 'fast-map-zoom';
      this.zoomBox.innerHTML = '<button type="button" aria-label="Zoom avant">+</button><button type="button" aria-label="Zoom arrière">−</button>';
      const [plus, minus] = this.zoomBox.querySelectorAll('button');
      plus.addEventListener('click', e => { e.stopPropagation(); this.setZoom(this.zoom + 1); });
      minus.addEventListener('click', e => { e.stopPropagation(); this.setZoom(this.zoom - 1); });
      this.attr = document.createElement('div');
      this.attr.className = 'fast-map-attribution';
      this.attr.textContent = '© OpenStreetMap';
      this.host.append(this.tileLayer, this.overlay, this.zoomBox, this.attr);
    }

    bindGestures() {
      const host = this.host;
      const coords = event => ({x:event.clientX, y:event.clientY});
      const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

      host.addEventListener('pointerdown', event => {
        if (event.target.closest?.('.fast-map-zoom')) return;
        host.setPointerCapture?.(event.pointerId);
        const p = coords(event);
        this.activePointers.set(event.pointerId,p);
        if (this.activePointers.size === 1) {
          this.dragPointer = event.pointerId;
          this.lastPoint = p;
        } else if (this.activePointers.size === 2) {
          const values = [...this.activePointers.values()];
          this.pinchDistance = distance(values[0],values[1]);
          this.dragPointer = null;
          this.lastPoint = null;
        }
        event.preventDefault();
      }, {passive:false});

      host.addEventListener('pointermove', event => {
        if (!this.activePointers.has(event.pointerId)) return;
        const p = coords(event);
        this.activePointers.set(event.pointerId,p);
        if (this.activePointers.size >= 2) {
          const values = [...this.activePointers.values()].slice(0,2);
          const d = distance(values[0],values[1]);
          if (this.pinchDistance > 0) {
            const ratio = d / this.pinchDistance;
            if (ratio > 1.18 && this.zoom < MAX_ZOOM) {
              this.setZoom(this.zoom + 1, false);
              this.pinchDistance = d;
            } else if (ratio < 0.84 && this.zoom > MIN_ZOOM) {
              this.setZoom(this.zoom - 1, false);
              this.pinchDistance = d;
            }
          } else this.pinchDistance = d;
        } else if (this.dragPointer === event.pointerId && this.lastPoint) {
          const dx = p.x - this.lastPoint.x;
          const dy = p.y - this.lastPoint.y;
          this.panBy(dx,dy);
          this.lastPoint = p;
        }
        event.preventDefault();
      }, {passive:false});

      const finish = event => {
        this.activePointers.delete(event.pointerId);
        try { host.releasePointerCapture?.(event.pointerId); } catch {}
        if (this.activePointers.size === 1) {
          const [id,p] = this.activePointers.entries().next().value;
          this.dragPointer = id;
          this.lastPoint = p;
          this.pinchDistance = 0;
        } else if (this.activePointers.size === 0) {
          this.dragPointer = null;
          this.lastPoint = null;
          this.pinchDistance = 0;
        }
        event.preventDefault?.();
      };
      host.addEventListener('pointerup', finish, {passive:false});
      host.addEventListener('pointercancel', finish, {passive:false});

      host.addEventListener('wheel', event => {
        this.setZoom(this.zoom + (event.deltaY < 0 ? 1 : -1));
        event.preventDefault();
      }, {passive:false});

      host.addEventListener('dblclick', event => {
        if (event.target.closest?.('.fast-map-zoom')) return;
        this.setZoom(this.zoom + 1);
        event.preventDefault();
      });
    }

    panBy(dx,dy) {
      const p = project(this.center.lat,this.center.lng,this.zoom);
      this.center = unproject(p.x - dx,p.y - dy,this.zoom);
      this.schedule();
    }

    setZoom(value, schedule=true) {
      const z = clamp(Math.round(Number(value)||this.zoom),MIN_ZOOM,MAX_ZOOM);
      if (z === this.zoom) return this;
      this.zoom = z;
      if (schedule) this.schedule(); else this.render();
      return this;
    }

    setView(coords, zoom) {
      const p = Array.isArray(coords) ? {lat:Number(coords[0]),lng:Number(coords[1])} : point(coords);
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) this.center = p;
      if (zoom != null) this.zoom = clamp(Math.round(Number(zoom)||this.zoom),MIN_ZOOM,MAX_ZOOM);
      this.schedule();
      return this;
    }

    fitBounds(bounds, options={}) {
      const rows = Array.isArray(bounds) ? bounds : [];
      const pts = rows.map(row => Array.isArray(row) ? {lat:Number(row[0]),lng:Number(row[1])} : point(row)).filter(Boolean);
      if (!pts.length) return this;
      if (pts.length === 1) return this.setView(pts[0],15);
      const minLat = Math.min(...pts.map(p=>p.lat)), maxLat = Math.max(...pts.map(p=>p.lat));
      const minLng = Math.min(...pts.map(p=>p.lng)), maxLng = Math.max(...pts.map(p=>p.lng));
      this.center = {lat:(minLat+maxLat)/2,lng:(minLng+maxLng)/2};
      const width = Math.max(120,this.host.clientWidth - Number(options.padding?.[0]||options.padding||70)*2);
      const height = Math.max(120,this.host.clientHeight - Number(options.padding?.[1]||options.padding||70)*2);
      for (let z=MAX_ZOOM; z>=MIN_ZOOM; z--) {
        const a=project(maxLat,minLng,z), b=project(minLat,maxLng,z);
        if (Math.abs(b.x-a.x)<=width && Math.abs(b.y-a.y)<=height) { this.zoom=z; break; }
      }
      this.schedule();
      return this;
    }

    removeLayer(layer) {
      try { layer?.remove?.(); } catch {}
      return this;
    }

    resize() { this.schedule(); return this; }

    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => { this.frame=0; this.render(); });
    }

    render() {
      if (this.destroyed || !this.host.isConnected) return;
      const width = this.host.clientWidth || window.innerWidth;
      const height = this.host.clientHeight || window.innerHeight;
      if (width < 10 || height < 10) return;
      const centerPx = project(this.center.lat,this.center.lng,this.zoom);
      const topLeft = {x:centerPx.x-width/2,y:centerPx.y-height/2};
      const tilesPerAxis = Math.pow(2,this.zoom);
      const minX = Math.floor(topLeft.x/TILE_SIZE)-1;
      const maxX = Math.floor((topLeft.x+width)/TILE_SIZE)+1;
      const minY = Math.max(0,Math.floor(topLeft.y/TILE_SIZE)-1);
      const maxY = Math.min(tilesPerAxis-1,Math.floor((topLeft.y+height)/TILE_SIZE)+1);
      const needed = new Set();

      for (let tx=minX;tx<=maxX;tx++) {
        const wrappedX=((tx%tilesPerAxis)+tilesPerAxis)%tilesPerAxis;
        for (let ty=minY;ty<=maxY;ty++) {
          const key=`${this.zoom}/${tx}/${ty}`;
          needed.add(key);
          let img=this.tiles.get(key);
          if(!img){
            img=document.createElement('img');
            img.className='fast-map-tile';
            img.alt='';
            img.draggable=false;
            img.decoding='async';
            img.src=`https://tile.openstreetmap.org/${this.zoom}/${wrappedX}/${ty}.png`;
            img.addEventListener('load',()=>img.classList.add('loaded'),{once:true});
            img.addEventListener('error',()=>{ img.style.opacity='0'; },{once:true});
            this.tiles.set(key,img);
            this.tileLayer.appendChild(img);
          }
          img.style.left=`${tx*TILE_SIZE-topLeft.x}px`;
          img.style.top=`${ty*TILE_SIZE-topLeft.y}px`;
        }
      }

      for (const [key,img] of this.tiles) {
        if (!needed.has(key)) { img.remove(); this.tiles.delete(key); }
      }
      this.renderOverlay(topLeft,width,height);
    }

    screenPoint(p,topLeft) {
      const world=project(p.lat,p.lng,this.zoom);
      let x=world.x-topLeft.x;
      const worldWidth=TILE_SIZE*Math.pow(2,this.zoom);
      while(x < -worldWidth/2) x += worldWidth;
      while(x > this.host.clientWidth + worldWidth/2) x -= worldWidth;
      return {x,y:world.y-topLeft.y};
    }

    renderOverlay(topLeft) {
      const makeMarker=(key,p,kind,label='')=>{
        if(!p){ markers[key]?.remove(); markers[key]=null; return; }
        let el=markers[key];
        if(!el){ el=document.createElement('div'); el.className=`fast-map-marker ${kind}`; el.textContent=label; this.overlay.appendChild(el); markers[key]=el; }
        const s=this.screenPoint(p,topLeft); el.style.left=`${s.x}px`; el.style.top=`${s.y}px`;
      };
      makeMarker('pickup',point(state?.pickup),'pickup');
      makeMarker('destination',point(state?.destination),'destination');

      this.overlay.querySelectorAll('.fast-nearby-driver,.fast-live-driver').forEach(x=>x.remove());
      const driverPoints=[...nearby.map(x=>point(x)).filter(Boolean)];
      if(point(liveDriver)) driverPoints.push(point(liveDriver));
      driverPoints.forEach((p,i)=>{
        const el=document.createElement('div');
        el.className=`fast-map-marker driver ${i===driverPoints.length-1&&point(liveDriver)?'fast-live-driver':'fast-nearby-driver'}`;
        el.textContent='F';
        const s=this.screenPoint(p,topLeft); el.style.left=`${s.x}px`; el.style.top=`${s.y}px`; this.overlay.appendChild(el);
      });

      if(routeCoords.length>1){
        const points=routeCoords.map(p=>{const s=this.screenPoint(p,topLeft);return `${s.x},${s.y}`}).join(' ');
        this.routePath.setAttribute('points',points);
        this.routePath.style.display='';
      }else this.routePath.style.display='none';
    }
  }

  function ensureStableMap() {
    const host=document.getElementById('map');
    if(!host) return null;
    document.getElementById('fastOneFingerMapSurface')?.remove();
    document.getElementById('fastOneFingerMapZoom')?.remove();
    host.querySelectorAll('iframe.google-map-frame,.google-map-badge,.fast-map-loading').forEach(x=>x.remove());
    if(!stableMap || stableMap.host!==host){ stableMap=new StableMap(host); }
    state.map=stableMap;
    state.map.provider='fast-stable';
    return stableMap;
  }

  window.initMap=function initMapStable(){ ensureStableMap()?.resize(); };

  window.placeMarker=function placeMarkerStable(kind,coords){
    const map=ensureStableMap();
    if(!map||!point(coords))return;
    if(kind==='pickup') state.pickup=state.pickup||coords;
    if(kind==='destination') state.destination=state.destination||coords;
    map.render();
    window.fitMap();
  };

  window.fitMap=function fitStableMap(){
    const map=ensureStableMap(); if(!map)return;
    const pts=[point(state?.pickup),point(state?.destination)].filter(Boolean);
    if(routeCoords.length>1) map.fitBounds(routeCoords,{padding:70});
    else if(pts.length>1) map.fitBounds(pts,{padding:70});
    else if(pts.length===1) map.setView(pts[0],15);
  };

  window.clearDriverMarkers=function clearStableDrivers(){ nearby=[]; ensureStableMap()?.render(); };
  window.drawNearby=function drawStableNearby(items){ nearby=Array.isArray(items)?items:[]; ensureStableMap()?.render(); };
  window.drawRoute=function drawStableRoute(polyline){
    routeCoords=polyline?decodePolyline(polyline):[];
    const map=ensureStableMap(); if(!map)return;
    map.render();
    if(routeCoords.length>1) map.fitBounds(routeCoords,{padding:70});
  };

  const previousUpdateQuoteUI=window.updateQuoteUI;
  if(typeof previousUpdateQuoteUI==='function'){
    window.updateQuoteUI=function updateQuoteUIStable(q,...rest){
      const result=previousUpdateQuoteUI.call(this,q,...rest);
      if(q?.polyline) window.drawRoute(q.polyline); else window.fitMap();
      return result;
    };
  }

  const previousRenderDriverClient=window.renderDriverClient;
  if(typeof previousRenderDriverClient==='function'){
    window.renderDriverClient=function renderDriverClientStable(response){
      const result=previousRenderDriverClient.call(this,response);
      const loc=response?.driver_location;
      if(loc?.latitude!=null&&loc?.longitude!=null) liveDriver={lat:Number(loc.latitude),lng:Number(loc.longitude)};
      ensureStableMap()?.render();
      return result;
    };
  }

  const originalDetailsFor=window.detailsFor;
  if(typeof originalDetailsFor==='function'){
    window.detailsFor=async function detailsForStable(item){
      try{return await originalDetailsFor(item);}catch(error){
        const label=String(item?.label||'').trim();
        if(label){
          try{
            const bias=state?.coords?`&lat=${state.coords.lat}&lng=${state.coords.lng}`:'';
            const r=await api(`/v1/places/autocomplete?q=${encodeURIComponent(label)}${bias}`,{auth:false});
            const candidate=(r?.items||[]).find(x=>x?.lat!=null&&x?.lng!=null)||(r?.items||[])[0];
            if(candidate?.lat!=null&&candidate?.lng!=null) return {lat:Number(candidate.lat),lng:Number(candidate.lng),label:candidate.label||label,id:candidate.id||item?.id||null};
            if(candidate?.id&&candidate.id!==item?.id) return await originalDetailsFor(candidate);
          }catch{}
        }
        throw error;
      }
    };
  }

  window.addEventListener('resize',()=>stableMap?.resize());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)stableMap?.resize();});
})();
