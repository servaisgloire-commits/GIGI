import * as XLSX from 'xlsx';
import {getRides,getProfiles,getVehicles} from '@/services/data';
import {resolvePeriod,type PeriodKind} from '@/lib/periods';
export const dynamic='force-dynamic';
const validPeriod=(v:string):PeriodKind=>['day','week','month','custom'].includes(v)?v as PeriodKind:'month';

export async function GET(request:Request){
  const url=new URL(request.url),p=url.searchParams;
  const [rides,profiles,vehicles]=await Promise.all([getRides(),getProfiles(),getVehicles()]);
  const period=validPeriod(p.get('period')||'month');
  const {from,to}=resolvePeriod(period,p.get('from')||undefined,p.get('to')||undefined);
  const driverId=p.get('driverId')||'',status=p.get('status')||'',vehicleType=p.get('vehicleType')||'';
  const typeVehicleIds=new Set(vehicles.filter((v:any)=>!vehicleType||v.vehicle_type===vehicleType).map((v:any)=>v.id));
  const filtered=rides.filter((r:any)=>{
    const at=new Date(r.requested_at||r.created_at);
    return at>=from&&at<=to&&(!driverId||r.driver_id===driverId)&&(!status||r.status===status)&&(!vehicleType||r.requested_vehicle_type===vehicleType||typeVehicleIds.has(r.vehicle_id));
  });
  const name=(id:string|null)=>{const profile=profiles.find((x:any)=>x.id===id);return profile?`${profile.first_name||''} ${profile.last_name||''}`.trim():id||''};
  const rows=filtered.map((r:any)=>({ID:r.id,Date:r.requested_at||r.created_at,Client:name(r.client_id),Chauffeur:name(r.driver_id),Categorie:r.requested_vehicle_type,Depart:r.pickup_address,Destination:r.destination_address,Statut:r.status,Prix:r.final_price??r.agreed_price??r.estimated_price,Devise:r.currency}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Courses');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Periode_de:from.toISOString(),Periode_a:to.toISOString(),Chauffeur:driverId||'Tous',Statut:status||'Tous',Categorie:vehicleType||'Toutes',Lignes:rows.length}]),'Filtres');
  const out=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
  return new Response(new Uint8Array(out),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="FAST-courses.xlsx"'}});
}
