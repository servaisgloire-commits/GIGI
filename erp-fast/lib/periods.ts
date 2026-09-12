const TZ='Africa/Brazzaville';
const CONGO_OFFSET='+01:00';

function localDateString(d:Date){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function startOfLocalDate(s:string){return new Date(`${s}T00:00:00${CONGO_OFFSET}`)}
function endOfLocalDate(s:string){return new Date(`${s}T23:59:59.999${CONGO_OFFSET}`)}
function shiftDateString(s:string,days:number){const d=new Date(`${s}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

export type PeriodKind='day'|'week'|'month'|'custom';
export function resolvePeriod(kind:PeriodKind,fromRaw?:string,toRaw?:string,now=new Date()){
  const today=localDateString(now);
  let from:Date,to:Date;
  if(kind==='custom'&&fromRaw&&toRaw){
    from=startOfLocalDate(fromRaw);
    to=endOfLocalDate(toRaw);
  }else if(kind==='day'){
    from=startOfLocalDate(today);to=now;
  }else if(kind==='week'){
    const fake=new Date(`${today}T00:00:00Z`);
    const day=fake.getUTCDay()||7;
    const monday=shiftDateString(today,1-day);
    from=startOfLocalDate(monday);to=now;
  }else{
    from=startOfLocalDate(`${today.slice(0,7)}-01`);to=now;
  }
  if(from>to){const t=from;from=to;to=t}
  const duration=Math.max(0,to.getTime()-from.getTime());
  const previousTo=new Date(from.getTime()-1);
  const previousFrom=new Date(previousTo.getTime()-duration);
  return {from,to,previousFrom,previousTo,timeZone:TZ};
}
