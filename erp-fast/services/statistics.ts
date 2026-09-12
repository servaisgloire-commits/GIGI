import type { CommissionRule,Ride,Vehicle } from '@/lib/types';
import { commissionAmount,resolveCommissionRule } from './commissions';

export type PeriodStats={rides:number;revenue:number;commission:number;netProfit:number;missingCommissionRules:number;byDay:{date:string;rides:number;revenue:number;profit:number}[]};
export function computeStatistics(rides:Ride[],rules:CommissionRule[],vehicles:Vehicle[],from:Date,to:Date):PeriodStats{
  const done=rides.filter(r=>r.status==='completed').filter(r=>{const d=new Date(r.completed_at||r.created_at);return d>=from&&d<=to});
  let revenue=0,commission=0,missing=0;const days=new Map<string,{rides:number;revenue:number;profit:number}>();
  for(const ride of done){
    const amount=Number(ride.final_price??ride.agreed_price??ride.estimated_price??0);revenue+=amount;
    const vehicle=vehicles.find(v=>v.id===ride.vehicle_id)||null;const rule=resolveCommissionRule(ride,rules,vehicle);const fee=commissionAmount(amount,rule);
    if(fee===null)missing++;else commission+=fee;
    const date=new Date(ride.completed_at||ride.created_at).toISOString().slice(0,10),row=days.get(date)||{rides:0,revenue:0,profit:0};row.rides++;row.revenue+=amount;row.profit+=fee===null?0:amount-fee;days.set(date,row);
  }
  return {rides:done.length,revenue,commission,netProfit:revenue-commission,missingCommissionRules:missing,byDay:[...days.entries()].sort().map(([date,v])=>({date,...v}))};
}
