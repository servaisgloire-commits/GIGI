import {getDrivers,getProfiles,getVehicles,getRides} from '@/services/data';
export const dynamic='force-dynamic';

export default async function Exports(){
  const [drivers,profiles,vehicles,rides]=await Promise.all([getDrivers(),getProfiles(),getVehicles(),getRides()]);
  const name=(id:string)=>{const p=profiles.find((x:any)=>x.id===id);return p?`${p.first_name||''} ${p.last_name||''}`.trim()||id.slice(0,8):id.slice(0,8)};
  const vehicleTypes=[...new Set([...vehicles.map((v:any)=>v.vehicle_type),...rides.map((r:any)=>r.requested_vehicle_type)].filter(Boolean))].sort();
  const PeriodFields=()=> <><select className="input" name="period" defaultValue="month"><option value="day">Aujourd’hui</option><option value="week">Cette semaine</option><option value="month">Ce mois</option><option value="custom">Personnalisé</option></select><input className="input" type="date" name="from"/><input className="input" type="date" name="to"/></>;
  const DriverField=()=> <select className="input" name="driverId" defaultValue=""><option value="">Tous chauffeurs</option>{drivers.map((d:any)=><option key={d.user_id} value={d.user_id}>{name(d.user_id)}</option>)}</select>;
  const VehicleField=()=> <select className="input" name="vehicleType" defaultValue=""><option value="">Toutes catégories</option>{vehicleTypes.map(v=><option key={String(v)} value={String(v)}>{String(v)}</option>)}</select>;
  return <div>
    <h1 className="text-3xl font-black">Exports Excel</h1>
    <p className="muted mb-5">Les filtres choisis ici sont inscrits dans le fichier .xlsx généré.</p>
    <div className="grid lg:grid-cols-2 gap-5">
      <form className="card p-5 space-y-3" method="get" action="/api/exports/rides">
        <div><b>Courses</b><p className="text-sm muted mt-1">Trajets, prix, statut, chauffeur et client.</p></div>
        <PeriodFields/><DriverField/><VehicleField/>
        <select className="input" name="status" defaultValue=""><option value="">Tous statuts</option><option value="requested">Demandée</option><option value="searching">Recherche</option><option value="accepted">Acceptée</option><option value="driver_arriving">Chauffeur en approche</option><option value="in_progress">En cours</option><option value="completed">Terminée</option><option value="cancelled">Annulée</option></select>
        <button className="btn" type="submit">Exporter les courses</button>
      </form>
      <form className="card p-5 space-y-3" method="get" action="/api/exports/accounting">
        <div><b>Comptabilité / statistiques</b><p className="text-sm muted mt-1">CA, commissions, bénéfice et contrôle de certification.</p></div>
        <PeriodFields/><DriverField/><VehicleField/>
        <button className="btn" type="submit">Exporter la comptabilité</button>
      </form>
      <a className="card p-5 hover:border-blue-400" href="/api/exports/drivers"><b>Chauffeurs</b><p className="text-sm muted mt-2">Liste, disponibilité et statut administratif.</p><span className="btn inline-block mt-4">Exporter les chauffeurs</span></a>
    </div>
  </div>;
}
