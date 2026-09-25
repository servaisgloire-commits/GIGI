import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('app/src/main/assets/address-search.js','utf8');
function setup(api, details=async item=>item) {
  const elements={};
  for(const name of ['pickup','destination','pickupSuggestions','destinationSuggestions']) elements[name]={value:'',innerHTML:'',textContent:'',children:[]};
  const context={state:{coords:{lat:48.8566,lng:2.3522}},api,detailsFor:details,$:id=>elements[id],escapeHtml:String,placeMarker(){},quoteAll:async()=>{},toast:message=>context.message=message,clearTimeout,setTimeout,TypeError,document:{addEventListener:(event,fn)=>fn()}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {context,elements};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const paris={id:'paris',label:'10 Rue de Rivoli, Paris, France',lat:48.855,lng:2.36};
{
  const old=deferred(),recent=deferred();
  const {context:c,elements:e}=setup(url=>url.includes('Ancienne')?old.promise:recent.promise);
  e.destination.value='Ancienne';const first=c.suggest('destination',e.destination,e.destinationSuggestions);
  e.destination.value='Paris';const second=c.suggest('destination',e.destination,e.destinationSuggestions);
  recent.resolve({items:[paris]});await second;const shown=e.destinationSuggestions.innerHTML;
  old.resolve({items:[{id:'old',label:'Old result'}]});await first;
  assert.equal(e.destinationSuggestions.innerHTML,shown,'Stale search must never overwrite current suggestions');
}
{
  let requests=0;
  const {context:c,elements:e}=setup(async url=>{requests++;assert.match(url,/lat=48.8566&lng=2.3522/);assert.doesNotMatch(url,/country|region/);return {items:[paris]};});
  e.destination.value='Paris';await c.suggest('destination',e.destination,e.destinationSuggestions);
  const place=await c.ensurePlace('destination');assert.equal(place.id,'paris');assert.equal(requests,1,'Reuse successful suggestions when confirming typed address');
}
{
  const detail=deferred();const {context:c,elements:e}=setup(async()=>{throw new Error('Unexpected duplicate search');},()=>detail.promise);
  e.destination.value='Paris';const selecting=c.selectPlace('destination',paris,e.destination,e.destinationSuggestions);
  const confirming=c.ensurePlace('destination');detail.resolve(paris);
  await selecting;assert.equal((await confirming).id,'paris','Confirmation must wait for selected coordinates');
}
{
  const detail=deferred();const {context:c,elements:e}=setup(async()=>({items:[]}),()=>detail.promise);
  e.destination.value='Paris';const selecting=c.selectPlace('destination',paris,e.destination,e.destinationSuggestions);
  e.destination.value='Lyon';detail.resolve(paris);await selecting;
  assert.equal(c.state.destination,null,'Late place details must not replace edited text');
}
{
  const {context:c,elements:e}=setup(async()=>{throw new TypeError('Failed to fetch');});
  e.destination.value='Paris';await c.suggest('destination',e.destination,e.destinationSuggestions);
  assert.match(e.destinationSuggestions.textContent,/connexion/);
  await assert.rejects(c.ensurePlace('destination'),/connexion/);
}
{
  const {context:c,elements:e}=setup(async()=>({items:[]}));e.destination.value='Missing place';
  await assert.rejects(c.ensurePlace('destination'),/ville ou le code postal/);
}
console.log('Address search regression: 6 cases passed (France, stale responses, cached results, pending selection, edited text, network/empty results).');
