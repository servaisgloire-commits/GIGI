import type { CommissionRule,Ride,Vehicle } from '@/lib/types';

function activeAt(rule:CommissionRule,at:Date){
  const from=new Date(rule.valid_from),until=rule.valid_until?new Date(rule.valid_until):null;
  return rule.is_active&&from<=at&&(!until||at<until);
}
export function resolveCommissionRule(ride:Ride,rules:CommissionRule[],vehicle?:Vehicle|null){
  const at=new Date(ride.completed_at||ride.requested_at||ride.created_at);
  const eligible=rules.filter(r=>activeAt(r,at)).filter(r=>r.commission_type==='percentage'||r.currency===ride.currency);
  const priority=(r:CommissionRule)=>r.scope_type==='driver'&&r.driver_id===ride.driver_id?3:r.scope_type==='vehicle_category'&&r.vehicle_type===(vehicle?.vehicle_type||ride.requested_vehicle_type)?2:r.scope_type==='global'?1:0;
  return eligible.filter(r=>priority(r)>0).sort((a,b)=>priority(b)-priority(a)||new Date(b.valid_from).getTime()-new Date(a.valid_from).getTime())[0]||null;
}
export function commissionAmount(amount:number,rule:CommissionRule|null){
  if(!rule)return null;
  return rule.commission_type==='percentage'?amount*(Number(rule.value)/100):Number(rule.value);
}
