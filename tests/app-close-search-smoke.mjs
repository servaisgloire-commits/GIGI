import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync('app/src/main/assets/app-close-guard.js','utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

function makeDom({role='client',withNative=false,serverStatus='searching',offline=false}={}){
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fast.local/',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom;
  const calls=[];
  const native=[];
  let isOffline=offline;
  Object.assign(window,{
    role,
    currentRideId:'ride-close-1',
    token:'token-1',
    API:'https://api.test',
    async fetch(url,opts={}){
      const u=String(url),method=String(opts.method||'GET').toUpperCase();
      calls.push({u,method,body:opts.body||null});
      if(isOffline)throw new Error('NetworkError');
      if(u.endsWith('/v1/rides/ride-close-1')&&method==='GET')return {ok:true,status:200,json:async()=>({ride:{id:'ride-close-1',status:serverStatus}})};
      if(u.endsWith('/v1/rides/ride-close-1/status')&&method==='PATCH'){
        const body=JSON.parse(opts.body||'{}');
        const stillExpected=body.expected_current_status===serverStatus;
        return stillExpected
          ? {ok:true,status:200,json:async()=>({status:'cancelled'})}
          : {ok:false,status:409,json:async()=>({detail:'stale_ride_state'})};
      }
      throw new Error(`Unexpected fetch ${method} ${u}`);
    }
  });
  window.localStorage.setItem('fast_access_token','token-1');
  window.localStorage.setItem('fast_client_active_ride','ride-close-1');
  if(withNative)window.FASTNative={cancelSearchingRideOnClose(id){native.push(id)}};
  window.eval(source);
  return {dom,window,calls,native,setOffline(v){isOffline=v}};
}

// 1. Native Android path: close request is delegated exactly once and persisted for recovery.
{
  const x=makeDom({withNative:true,serverStatus:'searching'});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),true);
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),false,'duplicate close must not send twice');
  assert.deepEqual(x.native,['ride-close-1']);
  assert.equal(x.window.localStorage.getItem('fast_search_close_pending'),'ride-close-1');
  x.dom.window.close();
}

// 2. Web fallback: cancellation is conditional on server state at write time.
{
  const x=makeDom({withNative:false,serverStatus:'searching'});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),true);
  await wait(40);
  const patch=x.calls.find(c=>c.method==='PATCH');
  assert.ok(patch,'searching ride must be cancelled on close');
  const body=JSON.parse(patch.body);
  assert.equal(body.status,'cancelled');
  assert.equal(body.expected_current_status,'searching');
  assert.equal(body.cancellation_reason,'client_app_closed');
  assert.equal(x.window.localStorage.getItem('fast_search_close_pending'),null,'successful close cancel must clear pending marker');
  x.dom.window.close();
}

// 3. Race protection: a driver acceptance wins over the close cancellation.
{
  const x=makeDom({withNative:false,serverStatus:'accepted'});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),true);
  await wait(40);
  const patch=x.calls.find(c=>c.method==='PATCH');
  assert.ok(patch,'client may attempt conditional close cancellation');
  assert.equal(JSON.parse(patch.body).expected_current_status,'searching');
  assert.equal(x.window.localStorage.getItem('fast_search_close_pending'),null,'409 stale state must clear pending close marker');
  x.dom.window.close();
}

// 4. Driver app close must never cancel a passenger search.
{
  const x=makeDom({role:'driver',withNative:true,serverStatus:'searching'});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),false);
  assert.equal(x.native.length,0);
  assert.equal(x.calls.length,0);
  x.dom.window.close();
}

// 5. Offline shutdown: keep a pending marker and cancel immediately when network returns.
{
  const x=makeDom({withNative:false,serverStatus:'searching',offline:true});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),true);
  await wait(30);
  assert.equal(x.window.localStorage.getItem('fast_search_close_pending'),'ride-close-1');
  x.setOffline(false);
  x.window.dispatchEvent(new x.window.Event('online'));
  await wait(60);
  const patches=x.calls.filter(c=>c.method==='PATCH');
  assert.ok(patches.length>=2,'pending close must retry after network recovery');
  assert.equal(x.window.localStorage.getItem('fast_search_close_pending'),null);
  assert.equal(x.window.currentRideId,null,'recovered cancellation clears local active ride');
  x.dom.window.close();
}

console.log(JSON.stringify({ok:true,cases:['native-once','searching-cancelled-atomically','accepted-wins-race','driver-no-cancel','offline-close-recovered']}));
