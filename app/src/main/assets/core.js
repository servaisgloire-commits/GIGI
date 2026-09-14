'use strict';
const NATIVE=(()=>{try{return JSON.parse(window.FastNative?.config?.()||'{}')}catch{return {}}})();
const API=(NATIVE.apiUrl||'https://fast-n1-python-api.vercel.app').replace(/\/$/,'');
const SUPA=(NATIVE.supabaseUrl||'https://hmwxwzfcpdvgzjgxruup.supabase.co').replace(/\/$/,'');
const KEY=NATIVE.supabaseKey||'';
const $=id=>document.getElementById(id);
const state={session:null,me:null,role:null,quote:null,ride:null,offer:null,vehicle:null,coords:null,pickup:null,destination:null,rideType:'standard',payment:'cash',poll:null,offerPoll:null,gps:null,lastDispatchAt:0,map:null,pickupMarker:null,destinationMarker:null,driverMarkers:[],routeLayer:null};
function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3000)}
function saveSession(s){state.session=s;localStorage.setItem('fast.session',JSON.stringify(s||null))}
function loadSession(){try{state.session=JSON.parse(localStorage.getItem('fast.session')||'null')}catch{state.session=null}return state.session}
function token(){return state.session?.access_token||''}
async function parse(res){const text=await res.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={detail:text}}if(!res.ok)throw Object.assign(new Error(data.detail||data.message||`Erreur ${res.status}`),{status:res.status,data});return data}
async function refreshSession(){const refresh=state.session?.refresh_token;if(!refresh||!KEY)return false;try{const r=await fetch(`${SUPA}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh})});if(!r.ok)return false;const data=await r.json();saveSession({...state.session,...data});return !!data.access_token}catch{return false}}
async function api(path,{method='GET',body,auth=true,headers={},retry=true}={}){const h={Accept:'application/json',...headers};if(body!==undefined)h['Content-Type']='application/json';if(auth&&token())h.Authorization=`Bearer ${token()}`;const res=await fetch(API+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});if(res.status===401&&auth&&retry&&await refreshSession())return api(path,{method,body,auth,headers,retry:false});return parse(res)}
async function rest(path,{method='GET',body,headers={}}={}){const h={apikey:KEY,Authorization:`Bearer ${token()}`,Accept:'application/json',...headers};if(body!==undefined)h['Content-Type']='application/json';return parse(await fetch(`${SUPA}/rest/v1/${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}))}
async function rpc(name,body){return parse(await fetch(`${SUPA}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(body)}))}
async function upload(bucket,path,file){return parse(await fetch(`${SUPA}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token()}`,'x-upsert':'true','Content-Type':file.type||'application/octet-stream'},body:file}))}
function money(v,currency='XAF'){const n=Number(v)||0;return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:currency==='XAF'?0:2}).format(n)+' '+currency}
function debounce(fn,wait=280){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}
function initials(){return `${state.me?.first_name?.[0]||''}${state.me?.last_name?.[0]||''}`.toUpperCase()||'F'}
function rideStatus(s){return({searching:'Recherche d’un chauffeur',accepted:'Chauffeur trouvé',driver_arriving:'Votre chauffeur arrive',in_progress:'Course en cours',completed:'Course terminée',cancelled:'Course annulée'})[s]||s||'Course'}
function paymentLabel(v){return({cash:'Espèces',card:'Carte',wallet:'Portefeuille FAST',mtn_momo:'MTN MoMo',airtel_money:'Airtel Money',orange_money:'Orange Money'})[v]||v}
