import {Kpi} from '@/components/Kpi';
import {StatsChart} from '@/components/StatsChart';
import {getRides,getCommissionRules,getVehicles,getDrivers,getProfiles} from '@/services/data';
import {computeStatistics} from '@/services/statistics';
import {resolvePeriod,type PeriodKind} from '@/lib/periods';
export const dynamic='force-dynamic';

type SearchParams=Record<string,string|string[]|undefined>;
const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]||'':v||'';
const validPeriod=(v:string):PeriodKind=>['day','week','month','custom'].includes(v)?v as PeriodKind:'month';
const pct=(current:number,previous:number)=>previous===0?(current===0?'0 %':'Nouveau'):`${current>=previous?'+':''}${(((current-previous)/previous)*100).toFixed(1)} %`;

export default async function Statistics({searchParams}:{searchParams:Promise<SearchParams>}){
  const sp=await searchParams;
  const [rides,rules,vehicles,drivers,profiles]=await Promise.all([getRides(),getCommissionRules(),getVehicles(),getDrivers(),getProfiles()]);
  const period=validPeriod(one(sp.period));
  const {from,to,previousFrom,previousTo,timeZone}=resolvePeriod(period,one(sp.from),one(sp.to));
  const driverId=one(sp.driverId),vehicleType=one(sp.vehicleType);
  const vehicleIds=new Set(vehicles.filter((v:any)=>!vehicleType||v.vehicle_type===vehicleType).map((v:any)=>v.id));
  const filtered=rides.filter((r:any)=>(!driverId||r.driver_id===driverId)&&(!vehicleType||r.requested_vehicle_type===vehicleType||vehicleIds.has(r.vehicle_id)));
  const s=computeStatistics(filtered,rules,vehicles,from,to);
  const prev=computeStatistics(filtered,rules,vehicles,previousFrom,previousTo);
  const money=(x:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(x)} XAF`;
  const name=(id:string)=>{const p=profiles.find((x:any)=>x.id===id);return p?`${p.first_name||''} ${p.last_name||''}`.trim()||id.slice(0,8):id.slice(0,8)};
  const vehicleTypes=[...new Set([...vehicles.map((v:any)=>v.vehicle_type),...rides.map((r:any)=>r.requested_vehicle_type)].filter(Boolean))].sort();
  return <div>
    <h1 className="text-3xl font-black">Statistiques & Comptabilité</h1>
    <p className="muted mb-5">Calcul TypeScript • fuseau {timeZone} • aucune formule métier stockée dans Supabase.</p>
    <form method="get" className="card p-4 mb-5 grid md:grid-cols-6 gap-3">
      <select className="input" name="period" defaultValue={period}><option value="day">Aujourd’hui</option><option value="week">Cette semaine</option><option value="month">Ce mois</option><option value="custom">Personnalisé</option></select>
      <input className="input" type="date" name="from" defaultValue={one(sp.from)}/>
      <input className="input" type="date" name="to" defaultValue={one(sp.to)}/>
      <select className="input" name="driverId" defaultValue={driverId}><option value="">Tous chauffeurs</option>{drivers.map((d:any)=><option key={d.user_id} value={d.user_id}>{name(d.user_id)}</option>)}</select>
      <select className="input" name="vehicleType" defaultValue={vehicleType}><option value="">Toutes catégories</option>{vehicleTypes.map(v=><option key={String(v)} value={String(v)}>{String(v)}</option>)}</select>
      <button className="btn" type="submit">Appliquer</button>
    </form>
    <div className="text-sm muted mb-4">Période : {from.toLocaleString('fr-FR',{timeZone})} → {to.toLocaleString('fr-FR',{timeZone})}</div>
    <div className="grid-kpi">
      <Kpi label="Courses terminées" value={s.rides} detail={`${pct(s.rides,prev.rides)} vs période précédente`}/>
      <Kpi label="Chiffre d’affaires" value={money(s.revenue)} detail={`${pct(s.revenue,prev.revenue)} vs période précédente`}/>
      <Kpi label="Commissions" value={s.missingCommissionRules?'Incomplet':money(s.commission)} detail={s.missingCommissionRules?`${s.missingCommissionRules} course(s) sans règle`:`${pct(s.commission,prev.commission)} vs période précédente`}/>
      <Kpi label="Bénéfice net" value={s.netProfit===null?'Non calculable':money(s.netProfit)} detail={s.netProfit===null?'Configurez une règle applicable à chaque course avant certification.':prev.netProfit===null?'Comparaison précédente non certifiable':`${pct(s.netProfit,prev.netProfit)} vs période précédente`}/>
    </div>
    <div className="mt-6"><StatsChart data={s.byDay}/></div>
  </div>;
}
