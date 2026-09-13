import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync('app/src/main/assets/app-close-guard.js','utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

function makeDom({role='client',withNative=false,serverStatus='searching'}={}){
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://fast.local/',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom;
  const calls=[];
  const native=[];
  Object.assign(window,{
    role,
    currentRideId:'ride-close-1',
    token:'token-1',
    API:'https://api.test',
    async fetch(url,opts={}){
      const u=String(url),method=String(opts.method||'GET').toUpperCase();
      calls.push({u,method,body:opts.body||null});
      if(u.endsWith('/v1/rides/ride-close-1')&&method==='GET')return {ok:true,status:200,json:async()=>({ride:{id:'ride-close-1',status:serverStatus}})};
      if(u.endsWith('/v1/rides/ride-close-1/status')&&method==='PATCH')return {ok:true,status:200,json:async()=>({status:'cancelled'})};
      throw new Error(`Unexpected fetch ${method} ${u}`);
    }
  });
  window.localStorage.setItem('fast_access_token','token-1');
  window.localStorage.setItem('fast_client_active_ride','ride-close-1');
  if(withNative)window.FASTNative={cancelSearchingRideOnClose(id){native.push(id)}};
  window.eval(source);
  return {dom,window,calls,native};
}

// 1. Native Android path: close request is delegated exactly once.
{
  const x=makeDom({withNative:true,serverStatus:'searching'});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),true);
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),false,'duplicate close must not send twice');
  assert.deepEqual(x.native,['ride-close-1']);
  x.dom.window.close();
}

// 2. Web fallback: searching ride is cancelled with an explicit reason.
{
  const x=makeDom({withNative:false,serverStatus:'searching'});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),true);
  await wait(40);
  const patch=x.calls.find(c=>c.method==='PATCH');
  assert.ok(patch,'searching ride must be cancelled on close');
  const body=JSON.parse(patch.body);
  assert.equal(body.status,'cancelled');
  assert.equal(body.cancellation_reason,'client_app_closed');
  x.dom.window.close();
}

// 3. Race protection: if a driver accepted before close, do not cancel.
{
  const x=makeDom({withNative:false,serverStatus:'accepted'});
  assert.equal(x.window.FASTAppCloseGuard.closeNow(),true);
  await wait(40);
  assert.equal(x.calls.some(c=>c.method==='PATCH'),false,'accepted ride must survive app close');
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

console.log(JSON.stringify({ok:true,cases:['native-once','searching-cancelled','accepted-preserved','driver-no-cancel']}));
