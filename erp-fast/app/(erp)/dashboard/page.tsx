import Link from 'next/link';
import {Kpi} from '@/components/Kpi';
import {getProfiles,getDrivers,getRides,getCommissionRules,getVehicles,getAccountControls} from '@/services/data';
import {computeStatistics} from '@/services/statistics';
export const dynamic='force-dynamic';
const n=(v:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(v);

export default async function Dashboard(){
  const [profiles,drivers,rides,rules,vehicles,controls]=await Promise.all([getProfiles(),getDrivers(),getRides(),getCommissionRules(),getVehicles(),getAccountControls()]);
  const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);
  const stats=computeStatistics(rides,rules,vehicles,start,now);
  const activeDrivers=drivers.filter(d=>d.status!=='offline').length;
  const activeRides=rides.filter(r=>['requested','searching','accepted','driver_arriving','in_progress'].includes(r.status)).length;
  const today=rides.filter(r=>new Date(r.requested_at||r.created_at)>=start).length;
  const pending=profiles.filter(p=>{const c=controls.find((x:any)=>x.user_id===p.id);return !c||c.admin_status==='pending'}).length;
  return <div>
    <div className="flex justify-between items-end mb-6">
      <div><h1 className="text-3xl font-black">Tableau de bord</h1><p className="muted">Vue temps réel de l’activité FAST</p></div>
      <Link className="btn" href="/statistiques">Statistiques / Comptabilité</Link>
    </div>
    <div className="grid-kpi">
      <Kpi label="Chauffeurs actifs" value={activeDrivers} detail={`${drivers.length} chauffeurs inscrits`}/>
      <Kpi label="Courses aujourd’hui" value={today} detail={`${activeRides} en cours`}/>
      <Kpi label="CA du jour" value={`${n(stats.revenue)} XAF`} detail={`${stats.rides} courses terminées`}/>
      <Kpi label="Bénéfice estimé" value={stats.netProfit===null?'À configurer':`${n(stats.netProfit)} XAF`} detail={stats.netProfit===null?`${stats.missingCommissionRules} course(s) sans règle de commission`:'Commission dynamique appliquée'}/>
    </div>
    <div className="grid lg:grid-cols-2 gap-5 mt-6">
      <div className="card p-5"><h2 className="font-black text-lg">Inscriptions à contrôler</h2><div className="text-4xl font-black mt-4">{pending}</div><p className="muted text-sm mt-2">Clients et chauffeurs sans validation administrative définitive.</p></div>
      <div className="card p-5"><h2 className="font-black text-lg">État du calcul comptable</h2><p className="mt-4 text-sm">{rules.length?`${rules.length} règle(s) de commission versionnée(s).`:'Aucune règle de commission configurée. Le bénéfice ne sera pas certifié tant qu’une règle réelle n’est pas créée.'}</p></div>
    </div>
  </div>;
}
