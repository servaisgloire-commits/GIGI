import type { CommissionRule,Ride,Vehicle } from '@/lib/types';
import { commissionAmount,resolveCommissionRule } from './commissions';

export type PeriodStats={
  rides:number;
  revenue:number;
  commission:number;
  netProfit:number|null;
  missingCommissionRules:number;
  byDay:{date:string;rides:number;revenue:number;profit:number|null;missingCommissionRules:number}[];
};

export function computeStatistics(rides:Ride[],rules:CommissionRule[],vehicles:Vehicle[],from:Date,to:Date):PeriodStats{
  const done=rides
    .filter(r=>r.status==='completed')
    .filter(r=>{const d=new Date(r.completed_at||r.created_at);return d>=from&&d<=to});

  let revenue=0,commission=0,missing=0;
  const days=new Map<string,{rides:number;revenue:number;commission:number;missingCommissionRules:number}>();

  for(const ride of done){
    const amount=Number(ride.final_price??ride.agreed_price??ride.estimated_price??0);
    revenue+=amount;
    const vehicle=vehicles.find(v=>v.id===ride.vehicle_id)||null;
    const rule=resolveCommissionRule(ride,rules,vehicle);
    const fee=commissionAmount(amount,rule);
    const date=new Date(ride.completed_at||ride.created_at).toISOString().slice(0,10);
    const row=days.get(date)||{rides:0,revenue:0,commission:0,missingCommissionRules:0};
    row.rides++;
    row.revenue+=amount;
    if(fee===null){
      missing++;
      row.missingCommissionRules++;
    }else{
      commission+=fee;
      row.commission+=fee;
    }
    days.set(date,row);
  }

  return {
    rides:done.length,
    revenue,
    commission,
    netProfit:missing>0?null:revenue-commission,
    missingCommissionRules:missing,
    byDay:[...days.entries()].sort().map(([date,v])=>({
      date,
      rides:v.rides,
      revenue:v.revenue,
      profit:v.missingCommissionRules>0?null:v.revenue-v.commission,
      missingCommissionRules:v.missingCommissionRules
    }))
  };
}
