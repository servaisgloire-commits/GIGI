/* FAST Google Maps adapter. No MapLibre dependency.
   It exposes the small map API surface used by the existing FAST UI while rendering with Google Maps. */
(function(){
  const state={ready:false,loading:false,waiters:[]};
  function apiKey(){try{return FASTNative.googleMapsApiKey?FASTNative.googleMapsApiKey():''}catch(e){return ''}}
  function loadGoogle(){
    if(state.ready||state.loading)return;
    state.loading=true;
    window.__fastGoogleMapsReady=function(){state.ready=true;state.loading=false;const q=state.waiters.splice(0);q.forEach(fn=>{try{fn()}catch(e){console.error(e)}})};
    const key=apiKey();
    if(!key){console.error('FAST Google Maps API key missing');return;}
    const s=document.createElement('script');
    s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&libraries=geometry&callback=__fastGoogleMapsReady';
    s.async=true;s.defer=true;s.onerror=()=>{state.loading=false;console.error('Google Maps load failed')};document.head.appendChild(s);
  }
  function whenReady(fn){if(state.ready&&window.google&&google.maps)fn();else{state.waiters.push(fn);loadGoogle()}}
  function toLatLng(c){return Array.isArray(c)?{lat:Number(c[1]),lng:Number(c[0])}:c}
  function color(v,fallback){return typeof v==='string'?v:fallback}
  function number(v,fallback){const n=Number(v);return Number.isFinite(n)?n:fallback}

  class Source{
    constructor(owner,id,data){this.owner=owner;this.id=id;this.data=data}
    setData(data){this.data=data;this.owner._renderLayerForSource(this.id)}
  }

  class MapCompat{
    constructor(opts){
      this.opts=opts||{};this.sources={};this.layers={};this.overlays={};this.loaded=false;this.events={};
      this.dragRotate={enable(){}};this.touchZoomRotate={enable(){}};
      whenReady(()=>this._init());
    }
    _init(){
      const el=typeof this.opts.container==='string'?document.getElementById(this.opts.container):this.opts.container;
      this.gmap=new google.maps.Map(el,{center:toLatLng(this.opts.center||[15.2429,-4.2634]),zoom:number(this.opts.zoom,15),mapTypeControl:false,streetViewControl:false,fullscreenControl:false,rotateControl:false,clickableIcons:false,gestureHandling:'greedy',backgroundColor:'#e7edf5',disableDefaultUI:true,zoomControl:false});
      this.loaded=true;
      setTimeout(()=>{this._emit('load');const t=document.getElementById('mapEngineText');if(t)t.textContent='Google Maps';},0);
    }
    on(name,fn){(this.events[name]||(this.events[name]=[])).push(fn);if(name==='load'&&this.loaded)setTimeout(fn,0);return this}
    _emit(name,arg){(this.events[name]||[]).forEach(fn=>{try{fn(arg)}catch(e){console.error(e)}})}
    resize(){if(this.gmap)google.maps.event.trigger(this.gmap,'resize')}
    isStyleLoaded(){return !!this.loaded}
    addSource(id,def){this.sources[id]=new Source(this,id,def&&def.data);return this}
    getSource(id){return this.sources[id]||null}
    removeSource(id){delete this.sources[id]}
    addLayer(layer){this.layers[layer.id]=layer;this._drawLayer(layer.id);return this}
    getLayer(id){return this.layers[id]||null}
    removeLayer(id){this._clearOverlay(id);delete this.layers[id]}
    _clearOverlay(id){const o=this.overlays[id];if(!o)return;if(Array.isArray(o))o.forEach(x=>x&&x.setMap&&x.setMap(null));else if(o.setMap)o.setMap(null);delete this.overlays[id]}
    _renderLayerForSource(sourceId){Object.keys(this.layers).forEach(id=>{if(this.layers[id].source===sourceId)this._drawLayer(id)})}
    _drawLayer(id){
      if(!this.loaded)return;const layer=this.layers[id],src=layer&&this.sources[layer.source];if(!layer||!src)return;this._clearOverlay(id);
      const data=src.data||{},features=data.type==='FeatureCollection'?(data.features||[]):[data];const objects=[];
      features.forEach(f=>{
        if(!f||!f.geometry)return;
        if(layer.type==='line'&&f.geometry.type==='LineString'){
          const paint=layer.paint||{};objects.push(new google.maps.Polyline({map:this.gmap,path:(f.geometry.coordinates||[]).map(toLatLng),strokeColor:color(paint['line-color'],'#0b57d0'),strokeOpacity:number(paint['line-opacity'],.95),strokeWeight:number(paint['line-width'],6),geodesic:false,zIndex:20}));
        }else if(layer.type==='circle'&&f.geometry.type==='Point'){
          const p=layer.paint||{},c=toLatLng(f.geometry.coordinates);objects.push(new google.maps.Marker({map:this.gmap,position:c,icon:{path:google.maps.SymbolPath.CIRCLE,scale:number(p['circle-radius'],8),fillColor:color(p['circle-color'],'#1677ff'),fillOpacity:1,strokeColor:color(p['circle-stroke-color'],'#fff'),strokeWeight:number(p['circle-stroke-width'],3)},zIndex:30}));
        }
      });
      this.overlays[id]=objects;
    }
    fitBounds(bounds,opts){if(!this.gmap)return;const b=bounds&&bounds._b?bounds._b:bounds;if(!b)return;const pad=opts&&opts.padding?opts.padding:40;this.gmap.fitBounds(b,pad);if(opts&&opts.maxZoom)google.maps.event.addListenerOnce(this.gmap,'idle',()=>{if(this.gmap.getZoom()>opts.maxZoom)this.gmap.setZoom(opts.maxZoom)})}
    easeTo(o){if(!this.gmap)return;if(o.center)this.gmap.panTo(toLatLng(o.center));if(o.zoom!=null)this.gmap.setZoom(Number(o.zoom));if(o.bearing!=null&&this.gmap.setHeading)this.gmap.setHeading(Number(o.bearing));if(o.pitch!=null&&this.gmap.setTilt)this.gmap.setTilt(Number(o.pitch))}
  }

  class BoundsCompat{
    constructor(){this._b=null;whenReady(()=>{if(!this._b)this._b=new google.maps.LatLngBounds()})}
    extend(c){whenReady(()=>{if(!this._b)this._b=new google.maps.LatLngBounds();this._b.extend(toLatLng(c))});return this}
  }

  class PopupCompat{
    constructor(){this.html=''}
    setHTML(v){this.html=String(v||'');return this}
  }

  class MarkerCompat{
    constructor(opts){this.el=opts&&opts.element;this.popup=null;this.map=null;this.position=null;this.overlay=null}
    setLngLat(c){this.position=toLatLng(c);if(this.overlay&&this.overlay.setPosition)this.overlay.setPosition(this.position);return this}
    setPopup(p){this.popup=p;return this}
    addTo(map){this.map=map;whenReady(()=>this._mount());return this}
    _mount(){
      if(!this.map||!this.map.gmap||!this.position)return;const self=this;
      class HtmlOverlay extends google.maps.OverlayView{
        constructor(){super();this.div=null;this.pos=self.position}
        onAdd(){this.div=document.createElement('div');this.div.style.position='absolute';this.div.style.cursor='pointer';if(self.el)this.div.appendChild(self.el);this.getPanes().overlayMouseTarget.appendChild(this.div);if(self.popup&&self.popup.html)this.div.addEventListener('click',()=>{if(!self.info)self.info=new google.maps.InfoWindow();self.info.setContent(self.popup.html);self.info.setPosition(this.pos);self.info.open({map:self.map.gmap})})}
        draw(){if(!this.div)return;const p=this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat,this.pos.lng));this.div.style.left=(p.x-29)+'px';this.div.style.top=(p.y-29)+'px'}
        onRemove(){if(this.div){this.div.remove();this.div=null}}
        setPosition(pos){this.pos=pos;this.draw()}
      }
      this.overlay=new HtmlOverlay();this.overlay.setMap(this.map.gmap);
    }
    remove(){if(this.overlay)this.overlay.setMap(null);if(this.info)this.info.close();this.overlay=null}
  }

  window.mapboxgl={Map:MapCompat,Marker:MarkerCompat,Popup:PopupCompat,LngLatBounds:BoundsCompat,accessToken:''};
  window.maplibregl=undefined;
  loadGoogle();
})();