/* FAST Google Maps adapter - Google Maps only, optimized for Android WebView. */
(function(){
  const state={ready:false,loading:false,waiters:[],timer:null};
  function apiKey(){try{return window.FASTNative&&FASTNative.googleMapsApiKey?String(FASTNative.googleMapsApiKey()||''):''}catch(e){return ''}}
  function setStatus(text){const t=document.getElementById('mapEngineText');if(t)t.textContent=text}
  function fail(message){state.loading=false;clearTimeout(state.timer);setStatus(message||'Carte indisponible');console.error('FAST MAP:',message);}
  function loadGoogle(){
    if(state.ready||state.loading)return;
    if(window.google&&google.maps){state.ready=true;flush();return;}
    const key=apiKey();
    if(!key){fail('Clé Google absente');return;}
    state.loading=true;setStatus('Chargement…');
    window.__fastGoogleMapsReady=function(){state.ready=true;state.loading=false;clearTimeout(state.timer);setStatus('Google Maps');flush()};
    const old=document.getElementById('fast-google-maps-sdk');if(old)old.remove();
    const s=document.createElement('script');s.id='fast-google-maps-sdk';s.async=true;s.defer=true;
    s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&libraries=geometry&loading=async&callback=__fastGoogleMapsReady';
    s.onerror=()=>fail('Erreur Google Maps');document.head.appendChild(s);
    state.timer=setTimeout(()=>{if(!state.ready)fail('Google Maps bloqué')},15000);
  }
  function flush(){const q=state.waiters.splice(0);q.forEach(fn=>{try{fn()}catch(e){console.error(e)}})}
  function whenReady(fn){if(state.ready&&window.google&&google.maps)fn();else{state.waiters.push(fn);loadGoogle()}}
  function toLatLng(c){return Array.isArray(c)?{lat:Number(c[1]),lng:Number(c[0])}:c}
  function color(v,f){return typeof v==='string'?v:f} function number(v,f){const n=Number(v);return Number.isFinite(n)?n:f}
  const fastMapStyle=[
    {featureType:'poi',stylers:[{visibility:'off'}]},
    {featureType:'transit',stylers:[{visibility:'off'}]},
    {featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},
    {featureType:'administrative.land_parcel',stylers:[{visibility:'off'}]},
    {featureType:'landscape.man_made',elementType:'labels',stylers:[{visibility:'off'}]}
  ];
  class Source{constructor(owner,id,data){this.owner=owner;this.id=id;this.data=data}setData(data){this.data=data;this.owner._renderLayerForSource(this.id)}}
  class MapCompat{
    constructor(opts){this.opts=opts||{};this.sources={};this.layers={};this.overlays={};this.loaded=false;this.events={};this.dragRotate={enable(){}};this.touchZoomRotate={enable(){}};whenReady(()=>this._init())}
    _init(){const el=typeof this.opts.container==='string'?document.getElementById(this.opts.container):this.opts.container;if(!el){fail('Zone carte absente');return} el.style.background='#e8eef6';this.gmap=new google.maps.Map(el,{center:toLatLng(this.opts.center||[15.2429,-4.2634]),zoom:number(this.opts.zoom,15),mapTypeControl:false,streetViewControl:false,fullscreenControl:false,rotateControl:false,clickableIcons:false,gestureHandling:'greedy',backgroundColor:'#e7edf5',disableDefaultUI:true,zoomControl:false,styles:fastMapStyle});this.loaded=true;google.maps.event.addListenerOnce(this.gmap,'idle',()=>{google.maps.event.trigger(this.gmap,'resize');this._emit('load');setStatus('Google Maps')});setTimeout(()=>google.maps.event.trigger(this.gmap,'resize'),500)}
    on(n,f){(this.events[n]||(this.events[n]=[])).push(f);if(n==='load'&&this.loaded)setTimeout(f,0);return this}_emit(n,a){(this.events[n]||[]).forEach(f=>{try{f(a)}catch(e){console.error(e)}})}resize(){if(this.gmap)google.maps.event.trigger(this.gmap,'resize')}isStyleLoaded(){return!!this.loaded}
    addSource(id,d){this.sources[id]=new Source(this,id,d&&d.data);return this}getSource(id){return this.sources[id]||null}removeSource(id){delete this.sources[id]}addLayer(l){this.layers[l.id]=l;this._drawLayer(l.id);return this}getLayer(id){return this.layers[id]||null}removeLayer(id){this._clearOverlay(id);delete this.layers[id]}
    _clearOverlay(id){const o=this.overlays[id];if(!o)return;(Array.isArray(o)?o:[o]).forEach(x=>x&&x.setMap&&x.setMap(null));delete this.overlays[id]}_renderLayerForSource(s){Object.keys(this.layers).forEach(id=>{if(this.layers[id].source===s)this._drawLayer(id)})}
    _drawLayer(id){if(!this.loaded)return;const l=this.layers[id],src=l&&this.sources[l.source];if(!l||!src)return;this._clearOverlay(id);const d=src.data||{},fs=d.type==='FeatureCollection'?(d.features||[]):[d],os=[];fs.forEach(f=>{if(!f||!f.geometry)return;if(l.type==='line'&&f.geometry.type==='LineString'){const p=l.paint||{};os.push(new google.maps.Polyline({map:this.gmap,path:(f.geometry.coordinates||[]).map(toLatLng),strokeColor:color(p['line-color'],'#0b57d0'),strokeOpacity:number(p['line-opacity'],.95),strokeWeight:number(p['line-width'],6),zIndex:20}))}else if(l.type==='circle'&&f.geometry.type==='Point'){const p=l.paint||{},c=toLatLng(f.geometry.coordinates);os.push(new google.maps.Marker({map:this.gmap,position:c,icon:{path:google.maps.SymbolPath.CIRCLE,scale:number(p['circle-radius'],8),fillColor:color(p['circle-color'],'#1677ff'),fillOpacity:1,strokeColor:color(p['circle-stroke-color'],'#fff'),strokeWeight:number(p['circle-stroke-width'],3)},zIndex:30}))}});this.overlays[id]=os}
    fitBounds(bounds,opts){if(!this.gmap)return;const b=bounds&&bounds._b?bounds._b:bounds;if(!b)return;this.gmap.fitBounds(b,opts&&opts.padding?opts.padding:40)}easeTo(o){if(!this.gmap)return;if(o.center)this.gmap.panTo(toLatLng(o.center));if(o.zoom!=null)this.gmap.setZoom(Number(o.zoom))}
  }
  class BoundsCompat{constructor(){this._b=null;whenReady(()=>{if(!this._b)this._b=new google.maps.LatLngBounds()})}extend(c){whenReady(()=>{if(!this._b)this._b=new google.maps.LatLngBounds();this._b.extend(toLatLng(c))});return this}}
  class PopupCompat{constructor(){this.html=''}setHTML(v){this.html=String(v||'');return this}}
  class MarkerCompat{constructor(opts){this.el=opts&&opts.element;this.popup=null;this.map=null;this.position=null;this.overlay=null}setLngLat(c){this.position=toLatLng(c);if(this.overlay&&this.overlay.setPosition)this.overlay.setPosition(this.position);return this}setPopup(p){this.popup=p;return this}addTo(map){this.map=map;whenReady(()=>this._mount());return this}_mount(){if(!this.map||!this.map.gmap||!this.position)return;this.overlay=new google.maps.Marker({map:this.map.gmap,position:this.position});if(this.popup&&this.popup.html)this.overlay.addListener('click',()=>{if(!this.info)this.info=new google.maps.InfoWindow();this.info.setContent(this.popup.html);this.info.open({map:this.map.gmap,anchor:this.overlay})})}remove(){if(this.overlay)this.overlay.setMap(null);if(this.info)this.info.close();this.overlay=null}}
  window.mapboxgl={Map:MapCompat,Marker:MarkerCompat,Popup:PopupCompat,LngLatBounds:BoundsCompat,accessToken:''};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadGoogle,{once:true});else loadGoogle();
})();
