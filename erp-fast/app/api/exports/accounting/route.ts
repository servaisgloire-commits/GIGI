import * as XLSX from 'xlsx';
import {getRides,getCommissionRules,getVehicles} from '@/services/data';
import {computeStatistics} from '@/services/statistics';
export const dynamic='force-dynamic';

export async function GET(){
  const [rides,rules,vehicles]=await Promise.all([getRides(),getCommissionRules(),getVehicles()]);
  const to=new Date(),from=new Date(to.getFullYear(),to.getMonth(),1),s=computeStatistics(rides,rules,vehicles,from,to);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{
    Periode_de:from.toISOString(),
    Periode_a:to.toISOString(),
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
