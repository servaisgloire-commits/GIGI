import os
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hmwxwzfcpdvgzjgxruup.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
MIN_ANDROID_VERSION = os.getenv("MIN_ANDROID_VERSION", "0.1.0")
ANDROID_UPDATE_URL = os.getenv("ANDROID_UPDATE_URL", "")

app = FastAPI(title="FAST N1 Backend", version=APP_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

def db():
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "SUPABASE_SERVICE_ROLE_KEY is not configured on the server")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

class RideRequest(BaseModel):
    passenger_id: str
    pickup: Location
    destination: Location
    vehicle_type: str = "standard"
    payment_method: str = "wallet"

class DriverLocation(BaseModel):
    driver_id: str
    lat: float
    lng: float
    heading: Optional[float] = None
    speed_kmh: Optional[float] = None
    available: bool = True

class DispatchRequest(BaseModel):
    ride_id: str
    pickup: Location
    vehicle_type: str = "standard"
    radius_km: float = 10.0

class VersionRequest(BaseModel):
    version: str


def haversine_km(a_lat, a_lng, b_lat, b_lng):
    r = 6371.0
    dlat = radians(b_lat-a_lat)
    dlng = radians(b_lng-a_lng)
    x = sin(dlat/2)**2 + cos(radians(a_lat))*cos(radians(b_lat))*sin(dlng/2)**2
    return r * 2 * atan2(sqrt(x), sqrt(1-x))

@app.get("/")
def root():
    return {"service":"FAST N1 Python API","status":"online","version":APP_VERSION}

@app.get("/health")
def health():
    return {"ok":True,"service":"fast-n1","time":datetime.now(timezone.utc).isoformat(),"supabase_configured":bool(SUPABASE_SERVICE_ROLE_KEY)}

@app.post("/v1/version/check")
def version_check(body: VersionRequest):
    return {"current":body.version,"latest":APP_VERSION,"minimum":MIN_ANDROID_VERSION,"update_available":body.version != APP_VERSION,"update_url":ANDROID_UPDATE_URL}

@app.post("/v1/rides")
def create_ride(body: RideRequest):
    distance_km = haversine_km(body.pickup.lat, body.pickup.lng, body.destination.lat, body.destination.lng)
    estimated_minutes = max(4, round(distance_km / 24 * 60))
    base = {"standard":700,"comfort":1100,"xl":1500,"moto":400}.get(body.vehicle_type,700)
    per_km = {"standard":350,"comfort":480,"xl":600,"moto":240}.get(body.vehicle_type,350)
    price = round(base + distance_km * per_km)
    payload = {
        "passenger_id":body.passenger_id,
        "pickup_lat":body.pickup.lat,"pickup_lng":body.pickup.lng,
        "destination_lat":body.destination.lat,"destination_lng":body.destination.lng,
        "vehicle_type":body.vehicle_type,"payment_method":body.payment_method,
        "status":"searching","estimated_distance_km":round(distance_km,2),
        "estimated_duration_min":estimated_minutes,"estimated_price":price
    }
    result = db().table("rides").insert(payload).execute()
    return {"ride": result.data[0] if result.data else payload}

@app.post("/v1/drivers/location")
def update_driver_location(body: DriverLocation):
    payload = body.model_dump()
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = db().table("driver_locations").upsert(payload, on_conflict="driver_id").execute()
    return {"ok":True,"location":result.data[0] if result.data else payload}

@app.post("/v1/dispatch")
def dispatch(body: DispatchRequest):
    result = db().table("driver_locations").select("*").eq("available", True).limit(1000).execute()
    candidates=[]
    for d in result.data or []:
        try:
            distance=haversine_km(body.pickup.lat,body.pickup.lng,float(d["lat"]),float(d["lng"]))
        except (KeyError,TypeError,ValueError):
            continue
        if distance <= body.radius_km:
            eta=max(1,round(distance/25*60))
            rating=float(d.get("rating") or 5.0)
            score=distance*0.55 + eta*0.30 + (5-rating)*0.15
            candidates.append({**d,"distance_km":round(distance,2),"eta_min":eta,"dispatch_score":round(score,4)})
    candidates.sort(key=lambda x:x["dispatch_score"])
    best=candidates[0] if candidates else None
    if not best:
        return {"matched":False,"ride_id":body.ride_id,"candidates":0}
    db().table("rides").update({"driver_id":best["driver_id"],"status":"driver_assigned"}).eq("id",body.ride_id).execute()
    return {"matched":True,"ride_id":body.ride_id,"driver":best,"candidates":len(candidates)}
