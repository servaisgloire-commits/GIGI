import * as XLSX from 'xlsx';
import {getRides,getCommissionRules,getVehicles} from '@/services/data';
import {computeStatistics} from '@/services/statistics';
import {resolvePeriod,type PeriodKind} from '@/lib/periods';
export const dynamic='force-dynamic';
const validPeriod=(v:string):PeriodKind=>['day','week','month','custom'].includes(v)?v as PeriodKind:'month';

export async function GET(request:Request){
  const url=new URL(request.url),p=url.searchParams;
  const [rides,rules,vehicles]=await Promise.all([getRides(),getCommissionRules(),getVehicles()]);
  const period=validPeriod(p.get('period')||'month');
  const {from,to}=resolvePeriod(period,p.get('from')||undefined,p.get('to')||undefined);
  const driverId=p.get('driverId')||'',vehicleType=p.get('vehicleType')||'';
  const typeVehicleIds=new Set(vehicles.filter((v:any)=>!vehicleType||v.vehicle_type===vehicleType).map((v:any)=>v.id));
  const filtered=rides.filter((r:any)=>(!driverId||r.driver_id===driverId)&&(!vehicleType||r.requested_vehicle_type===vehicleType||typeVehicleIds.has(r.vehicle_id)));
  const s=computeStatistics(filtered,rules,vehicles,from,to);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{
    Periode_de:from.toISOString(),
    Periode_a:to.toISOString(),
    Chauffeur:driverId||'Tous',
    Categorie:vehicleType||'Toutes',
    Courses:s.rides,
    Chiffre_affaires:s.revenue,
    Commissions_connues:s.commission,
    Benefice_net:s.netProfit,
    Benefice_certifie:s.netProfit!==null?'OUI':'NON',
    Courses_sans_regle:s.missingCommissionRules
  }]),'Synthese');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(s.byDay),'Journalier');
  const out=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
  return new Response(new Uint8Array(out),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="FAST-comptabilite.xlsx"'}});
}
