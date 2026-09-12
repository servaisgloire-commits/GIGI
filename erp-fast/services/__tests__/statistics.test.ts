import {describe,it,expect} from 'vitest';
import {computeStatistics} from '../statistics';

const ride=(id:string,completed_at:string,price:number)=>({
  id,client_id:'c',driver_id:'d1',vehicle_id:null,status:'completed',currency:'XAF',requested_vehicle_type:'standard',requested_at:completed_at,completed_at,created_at:completed_at,final_price:price
} as any);

const globalRule=(id:string,value:number,valid_from:string,valid_until:string|null)=>({
  id,commission_type:'percentage',value,scope_type:'global',driver_id:null,vehicle_type:null,currency:'XAF',valid_from,valid_until,is_active:true,created_at:valid_from
} as any);

describe('statistiques comptables FAST',()=>{
  it('ne calcule pas de bénéfice silencieux si une commission manque',()=>{
    const rides=[ride('r1','2026-09-10T10:00:00Z',10000)];
    const s=computeStatistics(rides,[],[],new Date('2026-09-01T00:00:00Z'),new Date('2026-09-30T23:59:59Z'));
    expect(s.revenue).toBe(10000);
    expect(s.missingCommissionRules).toBe(1);
    expect(s.netProfit).toBeNull();
    expect(s.byDay[0].profit).toBeNull();
  });

  it('applique la règle versionnée correspondant à la date de chaque course',()=>{
    const rides=[
      ride('r1','2026-09-10T10:00:00Z',10000),
      ride('r2','2026-09-20T10:00:00Z',10000)
    ];
    const rules=[
      globalRule('old',10,'2026-09-01T00:00:00Z','2026-09-15T00:00:00Z'),
      globalRule('new',20,'2026-09-15T00:00:00Z',null)
    ];
    const s=computeStatistics(rides,rules,[],new Date('2026-09-01T00:00:00Z'),new Date('2026-09-30T23:59:59Z'));
    expect(s.missingCommissionRules).toBe(0);
    expect(s.commission).toBe(3000);
    expect(s.netProfit).toBe(17000);
  });
});
