'use strict';
const NATIVE=(()=>{try{return JSON.parse(window.FastNative?.config?.()||'{}')}catch{return {}}})();
const API=(NATIVE.apiUrl||'https://fast-n1-python-api.vercel.app').replace(/\/$/,'');
const SUPA=(NATIVE.supabaseUrl||'https://hmwxwzfcpdvgzjgxruup.supabase.co').replace(/\/$/,'');
const KEY=NATIVE.supabaseKey||'';
const $=id=>document.getElementById(id);
const state={session:null,me:null,role:null,quote:null,ride:null,offer:null,vehicle:null,coords:null,rideType:'standard',poll:null};
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function saveSession(s){state.session=s;localStorage.setItem('fast.session',JSON.stringify(s||null))}
function loadSession(){try{state.session=JSON.parse(localStorage.getItem('fast.session')||'null')}catch{state.session=null}return state.session}
function token(){return state.session?.access_token||''}
async function parse(res){const text=await res.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={detail:text}}if(!res.ok)throw new Error(data.detail||data.message||`Erreur ${res.status}`);return data}
async function api(path,{method='GET',body,auth=true,headers={}}={}){const h={Accept:'application/json',...headers};if(body!==undefined)h['Content-Type']='application/json';if(auth&&token())h.Authorization=`Bearer ${token()}`;return parse(await fetch(API+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}))}
async function rest(path,{method='GET',body,headers={}}={}){const h={apikey:KEY,Authorization:`Bearer ${token()}`,Accept:'application/json',...headers};if(body!==undefined)h['Content-Type']='application/json';return parse(await fetch(`${SUPA}/rest/v1/${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}))}
async function rpc(name,body){return parse(await fetch(`${SUPA}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(body)}))}
async function upload(bucket,path,file){const res=await fetch(`${SUPA}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token()}`,'x-upsert':'true','Content-Type':file.type||'application/octet-stream'},body:file});return parse(res)}
function authMode(mode){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.auth===mode));$('loginForm').classList.toggle('hidden',mode!=='login');$('signupForm').classList.toggle('hidden',mode!=='signup')}
function showApp(){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));$('app').classList.add('active')}
function showAuth(){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));$('auth').classList.add('active')}
function initials(){return `${state.me?.first_name?.[0]||''}${state.me?.last_name?.[0]||''}`.toUpperCase()||'F'}
function money(v){return new Intl.NumberFormat('fr-FR').format(Math.round(Number(v)||0))+' FCFA'}
function debounce(fn,wait=300){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}
function rideStatus(s){return({searching:'Recherche d’un chauffeur',offered:'Proposition envoyée',accepted:'Chauffeur en route',arrived:'Chauffeur arrivé',started:'Course en cours',completed:'Course terminée',cancelled:'Course annulée'})[s]||s||'Course'}
