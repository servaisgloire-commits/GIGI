import Link from 'next/link';
import {getProfiles,getDrivers,getDocuments,getAccountControls} from '@/services/data';
import {accountControlAction} from '@/app/actions';
export const dynamic='force-dynamic';

type SearchParams=Record<string,string|string[]|undefined>;
const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]||'':v||'';

export default async function Drivers({searchParams}:{searchParams:Promise<SearchParams>}){
  const sp=await searchParams;
  const [profiles,drivers,docs,controls]=await Promise.all([getProfiles(),getDrivers(),getDocuments(),getAccountControls()]);
  const q=one(sp.q).trim().toLowerCase();
  const availability=one(sp.availability);
  const adminStatus=one(sp.adminStatus);
  const sort=one(sp.sort)||'name';
  const rows=drivers.map(d=>{
    const p=profiles.find((x:any)=>x.id===d.user_id);
    const c=controls.find((x:any)=>x.user_id===d.user_id);
    const latest=docs.filter((x:any)=>x.driver_id===d.user_id);
    const approved=latest.filter((x:any)=>x.status==='approved').length;
    const label=`${p?.first_name||''} ${p?.last_name||''}`.trim();
    return {d,p,c,latest,approved,label};
  }).filter(r=>{
    const hay=`${r.label} ${r.p?.phone||''} ${r.p?.email||''} ${r.d.user_id}`.toLowerCase();
    if(q&&!hay.includes(q))return false;
    if(availability&&r.d.status!==availability)return false;
    if(adminStatus&&(r.c?.admin_status||'pending')!==adminStatus)return false;
    return true;
  }).sort((a,b)=>{
    if(sort==='rating')return Number(b.d.rating||0)-Number(a.d.rating||0);
    if(sort==='recent')return +new Date(b.d.created_at)-+new Date(a.d.created_at);
    if(sort==='rides')return Number(b.d.total_rides||0)-Number(a.d.total_rides||0);
    return a.label.localeCompare(b.label,'fr');
  });

  return <div>
    <h1 className="text-3xl font-black">Chauffeurs</h1>
    <p className="muted mb-5">Validation administrative distincte de la disponibilité opérationnelle.</p>
    <form method="get" className="card p-4 mb-5 grid md:grid-cols-5 gap-3">
      <input className="input" name="q" placeholder="Nom, téléphone, e-mail…" defaultValue={one(sp.q)}/>
      <select className="input" name="availability" defaultValue={availability}><option value="">Toutes disponibilités</option><option value="offline">Hors ligne</option><option value="available">Disponible</option><option value="busy">Occupé</option></select>
      <select className="input" name="adminStatus" defaultValue={adminStatus}><option value="">Tous statuts admin</option><option value="pending">En attente</option><option value="validated">Validé</option><option value="invalidated">Invalidé</option></select>
      <select className="input" name="sort" defaultValue={sort}><option value="name">Tri : nom</option><option value="rating">Tri : note</option><option value="rides">Tri : courses</option><option value="recent">Tri : inscription récente</option></select>
      <button className="btn" type="submit">Filtrer</button>
    </form>
    <div className="text-sm muted mb-3">{rows.length} chauffeur(s) affiché(s)</div>
    <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Chauffeur</th><th>Disponibilité</th><th>Documents</th><th>Statut admin</th><th>Compte</th><th>Actions</th></tr></thead><tbody>{rows.map(({d,p,c,latest,approved,label})=><tr key={d.user_id}><td><Link className="font-bold text-blue-700" href={`/chauffeurs/${d.user_id}`}>{label||'Sans nom'}</Link><div className="muted text-xs">{p?.phone||p?.email||d.user_id}</div><div className="muted text-xs">Note {Number(d.rating||0).toFixed(1)} • {d.total_rides||0} course(s)</div></td><td><span className="pill">{d.status}</span></td><td>{approved}/{latest.length} validés</td><td>{c?.admin_status||'pending'}</td><td>{c?.is_active===false?'Désactivé':'Actif'}</td><td><form action={accountControlAction} className="flex gap-2 flex-wrap"><input type="hidden" name="userId" value={d.user_id}/><input type="hidden" name="role" value="driver"/><select className="input" name="status" defaultValue={c?.admin_status||'pending'}><option value="pending">En attente</option><option value="validated">Validé</option><option value="invalidated">Invalidé</option></select><select className="input" name="active" defaultValue={String(c?.is_active!==false)}><option value="true">Compte actif</option><option value="false">Compte désactivé</option></select><input className="input" name="reason" placeholder="Motif interne" defaultValue={c?.internal_reason||''}/><button className="btn">Enregistrer</button></form></td></tr>)}</tbody></table></div>
  </div>;
}
