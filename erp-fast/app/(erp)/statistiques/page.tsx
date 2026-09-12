import {Kpi} from '@/components/Kpi';
import {StatsChart} from '@/components/StatsChart';
import {getRides,getCommissionRules,getVehicles} from '@/services/data';
import {computeStatistics} from '@/services/statistics';
export const dynamic='force-dynamic';

export default async function Statistics(){
  const [rides,rules,vehicles]=await Promise.all([getRides(),getCommissionRules(),getVehicles()]);
  const now=new Date(),from=new Date(now.getFullYear(),now.getMonth(),1);
  const s=computeStatistics(rides,rules,vehicles,from,now);
  const money=(x:number)=>`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(x)} XAF`;
  return <div>
    <h1 className="text-3xl font-black">Statistiques & Comptabilité</h1>
    <p className="muted mb-5">Mois en cours • calcul TypeScript, aucune formule métier stockée dans Supabase.</p>
    <div className="grid-kpi">
      <Kpi label="Courses terminées" value={s.rides}/>
      <Kpi label="Chiffre d’affaires" value={money(s.revenue)}/>
      <Kpi label="Commissions" value={s.missingCommissionRules?'Incomplet':money(s.commission)} detail={s.missingCommissionRules?`${s.missingCommissionRules} course(s) sans règle`:undefined}/>
      <Kpi label="Bénéfice net" value={s.netProfit===null?'Non calculable':money(s.netProfit)} detail={s.netProfit===null?'Configurez une règle applicable à chaque course avant certification.':undefined}/>
    </div>
    <div className="mt-6"><StatsChart data={s.byDay}/></div>
  </div>;
}
