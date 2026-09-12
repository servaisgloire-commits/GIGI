'use server';
import { revalidatePath } from 'next/cache';
import { setAccountControl } from '@/services/admin-controls';
import { updatePricing } from '@/services/pricing';
import { createCommissionRule } from '@/services/commissions-write';
import { cancelRide,reassignRide,updateRidePrice } from '@/services/rides';
import { reviewDocument } from '@/services/documents';
import { saveSetting } from '@/services/settings';

export async function accountControlAction(fd:FormData){await setAccountControl({userId:String(fd.get('userId')),role:String(fd.get('role')) as any,status:String(fd.get('status')) as any,active:String(fd.get('active'))==='true',reason:String(fd.get('reason')||'')});revalidatePath('/chauffeurs');revalidatePath('/clients')}
export async function pricingAction(fd:FormData){const id=String(fd.get('id'));const keys=['base_fare','per_km','per_minute','minimum_fare','booking_fee','night_multiplier','weekend_multiplier','holiday_multiplier'];await updatePricing(id,Object.fromEntries(keys.map(k=>[k,Number(fd.get(k)||0)])));revalidatePath('/tarification')}
export async function commissionAction(fd:FormData){await createCommissionRule({commission_type:String(fd.get('commission_type')) as any,value:Number(fd.get('value')),scope_type:String(fd.get('scope_type')) as any,driver_id:String(fd.get('driver_id')||'')||null,vehicle_type:String(fd.get('vehicle_type')||'')||null,currency:String(fd.get('currency')||'XAF'),valid_from:String(fd.get('valid_from')||new Date().toISOString()),valid_until:String(fd.get('valid_until')||'')||null});revalidatePath('/parametres');revalidatePath('/statistiques');revalidatePath('/dashboard')}
export async function cancelRideAction(fd:FormData){await cancelRide(String(fd.get('id')),String(fd.get('reason')||''));revalidatePath('/courses');revalidatePath('/dashboard')}
export async function reassignRideAction(fd:FormData){await reassignRide(String(fd.get('id')),String(fd.get('driverId')));revalidatePath('/courses')}
export async function updateRidePriceAction(fd:FormData){await updateRidePrice(String(fd.get('id')),Number(fd.get('price')));revalidatePath('/courses');revalidatePath('/statistiques')}
export async function reviewDocumentAction(fd:FormData){await reviewDocument(String(fd.get('id')),String(fd.get('status')) as any,String(fd.get('reason')||''));revalidatePath('/chauffeurs')}
export async function settingAction(fd:FormData){await saveSetting(String(fd.get('key')),String(fd.get('value')||''));revalidatePath('/parametres')}
