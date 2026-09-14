import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));

async function signed(bucket:string,path:unknown){
  const value=String(path||"").trim();
  if(!value)return null;
  if(/^https?:\/\//i.test(value))return value;
  const {data,error}=await admin.storage.from(bucket).createSignedUrl(value,1800);
  if(error||!data?.signedUrl)return null;
  return data.signedUrl;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    const token=auth.replace(/^Bearer\s+/i,"").trim();
    if(!token)return json({ok:false,error:"unauthorized"},401);
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user)return json({ok:false,error:"unauthorized"},401);

    const body=await req.json().catch(()=>({}));
    const rideId=String(body?.ride_id||"").trim();
    if(!uuid(rideId))return json({ok:false,error:"invalid_ride"},400);

    const {data:ride,error:rideError}=await admin.from("rides").select("id,client_id,driver_id,vehicle_id").eq("id",rideId).maybeSingle();
    if(rideError||!ride)return json({ok:false,error:"ride_not_found"},404);
    if(user.id!==ride.client_id&&user.id!==ride.driver_id)return json({ok:false,error:"forbidden"},403);
    if(!ride.driver_id)return json({ok:true,driver:null,vehicle:null});

    const [{data:profile},{data:driver}]=await Promise.all([
      admin.from("profiles").select("first_name,last_name,avatar_url").eq("id",ride.driver_id).maybeSingle(),
      admin.from("drivers").select("rating,total_rides").eq("user_id",ride.driver_id).maybeSingle(),
    ]);

    let vehicle:any=null;
    if(ride.vehicle_id){
      const {data}=await admin.from("vehicles").select("id,make,model,color,plate_number,vehicle_type,photo_path").eq("id",ride.vehicle_id).maybeSingle();
      vehicle=data;
    }
    if(!vehicle){
      const {data}=await admin.from("vehicles").select("id,make,model,color,plate_number,vehicle_type,photo_path").eq("driver_id",ride.driver_id).eq("is_active",true).limit(1).maybeSingle();
      vehicle=data;
    }

    const [driverPhoto,vehiclePhoto]=await Promise.all([
      signed("driver-photos",profile?.avatar_url),
      signed("vehicle-photos",vehicle?.photo_path),
    ]);
    return json({ok:true,driver:{...(driver||{}),...(profile||{}),photo_url:driverPhoto},vehicle:vehicle?{...vehicle,photo_url:vehiclePhoto}:null});
  }catch(error){
    console.error("fast-ride-identity",error);
    return json({ok:false,error:"internal_error"},500);
  }
});
