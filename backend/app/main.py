import os
import math
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

import httpx
from fastapi import FastAPI, HTTPException, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hmwxwzfcpdvgzjgxruup.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
APP_VERSION = os.getenv("APP_VERSION", "0.5.0")
MIN_ANDROID_VERSION = os.getenv("MIN_ANDROID_VERSION", "0.5.0")
ANDROID_UPDATE_URL = os.getenv("ANDROID_UPDATE_URL", "")

app = FastAPI(title="FAST N°1 API", version=APP_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Authorization", "Content-Type"])

def db():
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Supabase server key is not configured")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

class AuthUser(BaseModel):
    id: str
    role: str
    email: Optional[str] = None

async def current_user(authorization: Optional[str] = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(401, "Invalid token")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{SUPABASE_URL}/auth/v1/user", headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_SERVICE_ROLE_KEY})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired session")
    auth = r.json()
    profile = db().table("profiles").select("id,role").eq("id", auth["id"]).single().execute().data
    if not profile:
        raise HTTPException(403, "FAST profile missing")
    return AuthUser(id=auth["id"], role=str(profile["role"]), email=auth.get("email"))

def require_role(*roles):
    async def dep(user: AuthUser = Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(403, "Forbidden")
        return user
    return dep

class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

class RideCreate(BaseModel):
    pickup_address: str
    pickup: Location
    destination_address: str
    destination: Location
    vehicle_type: Literal["standard", "comfort", "xl", "moto"] = "standard"
    payment_method: Literal["wallet", "card", "mtn_momo", "airtel_money", "orange_money"] = "wallet"

class DriverLocation(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    heading: Optional[float] = None
    speed_kmh: Optional[float] = None
    accuracy_m: Optional[float] = None

class DriverAvailability(BaseModel):
    available: bool

class OfferDecision(BaseModel):
    accept: bool

class RideStatusUpdate(BaseModel):
    status: Literal["driver_arriving", "in_progress", "completed", "cancelled"]

class VersionRequest(BaseModel):
    version: str

def haversine_km(a_lat, a_lng, b_lat, b_lng):
    r = 6371.0088
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))

def parse_seconds(value: str | None) -> int:
    if not value or not value.endswith("s"):
        return 0
    try:
        return max(1, math.ceil(float(value[:-1]) / 60))
    except Exception:
        return 0

def maneuver_label(kind: str | None) -> str:
    labels = {"turn-left": "Tournez à gauche", "turn-right": "Tournez à droite", "turn-slight-left": "Légèrement à gauche", "turn-slight-right": "Légèrement à droite", "turn-sharp-left": "Virage serré à gauche", "turn-sharp-right": "Virage serré à droite", "straight": "Continuez tout droit", "roundabout-left": "Prenez le rond-point", "roundabout-right": "Prenez le rond-point", "uturn-left": "Faites demi-tour", "uturn-right": "Faites demi-tour", "depart": "Départ", "arrive": "Arrivée"}
    return labels.get(kind or "", "Continuez")

async def google_route(origin: Location, destination: Location):
    if not GOOGLE_MAPS_API_KEY:
        return None
    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": ",".join(["routes.distanceMeters", "routes.duration", "routes.staticDuration", "routes.polyline.encodedPolyline", "routes.description", "routes.travelAdvisory.speedReadingIntervals", "routes.legs.steps.distanceMeters", "routes.legs.steps.staticDuration", "routes.legs.steps.navigationInstruction.instructions", "routes.legs.steps.navigationInstruction.maneuver", "routes.legs.steps.polyline.encodedPolyline"])}
    body = {"origin": {"location": {"latLng": {"latitude": origin.lat, "longitude": origin.lng}}}, "destination": {"location": {"latLng": {"latitude": destination.lat, "longitude": destination.lng}}}, "travelMode": "DRIVE", "routingPreference": "TRAFFIC_AWARE_OPTIMAL", "computeAlternativeRoutes": True, "extraComputations": ["TRAFFIC_ON_POLYLINE"], "languageCode": "fr", "units": "METRIC"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post("https://routes.googleapis.com/directions/v2:computeRoutes", headers=headers, json=body)
    if r.status_code != 200 or not r.json().get("routes"):
        return None
    parsed = []
    for idx, rt in enumerate(r.json()["routes"][:3]):
        steps = []
        for leg in rt.get("legs", []):
            for step in leg.get("steps", []):
                ni = step.get("navigationInstruction", {})
                steps.append({"instruction": ni.get("instructions") or maneuver_label(ni.get("maneuver")), "maneuver": ni.get("maneuver"), "distance_m": int(step.get("distanceMeters") or 0), "duration_min": parse_seconds(step.get("staticDuration")), "polyline": step.get("polyline", {}).get("encodedPolyline")})
        parsed.append({"distance_km": round(float(rt.get("distanceMeters", 0)) / 1000, 2), "duration_min": parse_seconds(rt.get("duration")), "static_duration_min": parse_seconds(rt.get("staticDuration")), "traffic_duration_min": parse_seconds(rt.get("duration")), "polyline": rt.get("polyline", {}).get("encodedPolyline"), "traffic": rt.get("travelAdvisory", {}).get("speedReadingIntervals", []), "steps": steps, "description": rt.get("description") or ("Itinéraire recommandé" if idx == 0 else f"Alternative {idx + 1}"), "provider": "google", "route_rank": idx + 1})
    best = parsed[0]
    best["alternatives"] = [{"distance_km": a["distance_km"], "duration_min": a["duration_min"], "description": a["description"], "polyline": a["polyline"]} for a in parsed[1:]]
    best["route_quality"] = "premium_traffic"
    return best

async def osrm_route(origin: Location, destination: Location):
    coords = f"{origin.lng},{origin.lat};{destination.lng},{destination.lat}"
    params = {"overview": "full", "geometries": "polyline", "steps": "true", "alternatives": "true", "annotations": "false"}
    async with httpx.AsyncClient(timeout=16, headers={"User-Agent": "FAST-N1/0.5"}) as client:
        r = await client.get(f"https://router.project-osrm.org/route/v1/driving/{coords}", params=params)
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        return None
    parsed = []
    for idx, rt in enumerate(data["routes"][:3]):
        steps = []
        for leg in rt.get("legs", []):
            for step in leg.get("steps", []):
                man = step.get("maneuver", {})
                name = step.get("name") or ""
                modifier = man.get("modifier")
                kind = man.get("type")
                text = maneuver_label("turn-" + modifier if kind == "turn" and modifier else kind)
                if name:
                    text += f" sur {name}"
                steps.append({"instruction": text, "maneuver": f"{kind or ''}-{modifier or ''}".strip("-"), "distance_m": int(step.get("distance") or 0), "duration_min": max(1, round(float(step.get("duration") or 0) / 60)), "polyline": step.get("geometry")})
        parsed.append({"distance_km": round(float(rt.get("distance", 0)) / 1000, 2), "duration_min": max(1, round(float(rt.get("duration", 0)) / 60)), "static_duration_min": max(1, round(float(rt.get("duration", 0)) / 60)), "traffic_duration_min": None, "polyline": rt.get("geometry"), "traffic": [], "steps": steps, "description": "Itinéraire routier" if idx == 0 else f"Alternative {idx + 1}", "provider": "osrm", "route_rank": idx + 1})
    best = parsed[0]
    best["alternatives"] = [{"distance_km": a["distance_km"], "duration_min": a["duration_min"], "description": a["description"], "polyline": a["polyline"]} for a in parsed[1:]]
    best["route_quality"] = "road_detailed"
    return best

async def route_info(origin: Location, destination: Location):
    g = await google_route(origin, destination)
    if g:
        return g
    o = await osrm_route(origin, destination)
    if o:
        return o
    d = haversine_km(origin.lat, origin.lng, destination.lat, destination.lng)
    return {"distance_km": round(d * 1.25, 2), "duration_min": max(4, round(d * 1.25 / 24 * 60)), "static_duration_min": max(4, round(d * 1.25 / 24 * 60)), "traffic_duration_min": None, "polyline": None, "traffic": [], "steps": [], "alternatives": [], "provider": "fallback", "route_quality": "estimated"}

def price_for(vehicle_type: str, distance_km: float, duration_min: int):
    cfg = db().table("pricing_config").select("*").eq("service_type", vehicle_type).eq("is_active", True).limit(1).execute().data
    if cfg:
        c = cfg[0]
        return max(float(c["minimum_fare_xaf"]), round(float(c["base_fare_xaf"]) + distance_km * float(c["per_km_xaf"]) + duration_min * float(c["per_minute_xaf"]) + float(c["booking_fee_xaf"])))
    base, km, minute, minimum = {"standard": (700, 350, 40, 1000), "comfort": (1100, 480, 50, 1500), "xl": (1500, 600, 60, 2000), "moto": (400, 240, 25, 700)}[vehicle_type]
    return max(minimum, round(base + distance_km * km + duration_min * minute))

def load_available_drivers(vehicle_type: Optional[str] = None):
    drivers = db().table("drivers").select("user_id,rating,total_rides,status,is_verified").eq("status", "available").eq("is_verified", True).execute().data or []
    ids = [d["user_id"] for d in drivers]
    if not ids:
        return []
    locations = db().table("driver_locations").select("driver_id,latitude,longitude,heading,speed_kmh,accuracy_m,updated_at").in_("driver_id", ids).execute().data or []
    vehicles = db().table("vehicles").select("id,driver_id,make,model,color,plate_number,seats,vehicle_type,is_active").in_("driver_id", ids).eq("is_active", True).execute().data or []
    if vehicle_type:
        vehicles = [v for v in vehicles if v.get("vehicle_type") == vehicle_type]
    dmap = {d["user_id"]: d for d in drivers}; vmap = {v["driver_id"]: v for v in vehicles}; lmap = {l["driver_id"]: l for l in locations}
    return [{**dmap[driver_id], "vehicle": vehicle, "location": lmap[driver_id]} for driver_id, vehicle in vmap.items() if driver_id in lmap]

@app.get("/")
def root():
    return {"service": "FAST N°1 API", "status": "online", "version": APP_VERSION, "score_target": "9/10"}

@app.get("/health")
def health():
    return {"ok": True, "service": "fast-n1", "version": APP_VERSION, "supabase_configured": bool(SUPABASE_SERVICE_ROLE_KEY), "google_maps_configured": bool(GOOGLE_MAPS_API_KEY), "routing_fallback": "OSRM road routing", "gps_backend": "live", "time": datetime.now(timezone.utc).isoformat()}

@app.get("/v1/config")
def config():
    rows = db().table("app_settings").select("key,value").execute().data or []
    return {r["key"]: r["value"] for r in rows}

@app.post("/v1/version/check")
def version_check(body: VersionRequest):
    return {"current": body.version, "latest": APP_VERSION, "minimum": MIN_ANDROID_VERSION, "update_available": body.version != APP_VERSION, "update_url": ANDROID_UPDATE_URL}

@app.get("/v1/places/autocomplete")
async def autocomplete(q: str = Query(min_length=2, max_length=120)):
    if GOOGLE_MAPS_API_KEY:
        headers = {"Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text"}
        body = {"input": q, "includedRegionCodes": ["cg"], "locationBias": {"circle": {"center": {"latitude": -4.2634, "longitude": 15.2429}, "radius": 50000.0}}, "languageCode": "fr"}
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.post("https://places.googleapis.com/v1/places:autocomplete", headers=headers, json=body)
        if r.status_code == 200:
            items = []
            for s in r.json().get("suggestions", []):
                p = s.get("placePrediction", {})
                items.append({"id": p.get("placeId"), "label": p.get("text", {}).get("text"), "provider": "google"})
            return {"items": items}
    async with httpx.AsyncClient(timeout=12, headers={"User-Agent": "FAST-N1/0.5 support=servaisgloire@hotmail.com"}) as client:
        r = await client.get("https://nominatim.openstreetmap.org/search", params={"q": q, "format": "jsonv2", "limit": 6, "countrycodes": "cg", "addressdetails": 1})
    return {"items": [{"id": x.get("place_id"), "label": x.get("display_name"), "lat": float(x["lat"]), "lng": float(x["lon"]), "provider": "osm"} for x in (r.json() if r.status_code == 200 else [])]}

@app.get("/v1/places/details")
async def place_details(place_id: str):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(400, "Google place details requires GOOGLE_MAPS_API_KEY")
    async with httpx.AsyncClient(timeout=12) as client:
        r = await client.get(f"https://places.googleapis.com/v1/places/{place_id}", headers={"X-Goog-Api-Key": GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "id,displayName,formattedAddress,location"})
    if r.status_code != 200:
        raise HTTPException(502, "Place lookup failed")
    p = r.json(); loc = p.get("location", {})
    return {"id": p.get("id"), "label": p.get("formattedAddress") or p.get("displayName", {}).get("text"), "lat": loc.get("latitude"), "lng": loc.get("longitude")}

@app.post("/v1/routes/estimate")
async def estimate_route(body: RideCreate):
    rt = await route_info(body.pickup, body.destination)
    price = price_for(body.vehicle_type, rt["distance_km"], rt["duration_min"])
    return {**rt, "estimated_price": price, "currency": "XAF", "vehicle_type": body.vehicle_type}

@app.get("/v1/nearby-drivers")
async def nearby_drivers(lat: float, lng: float, vehicle_type: str = "standard", radius_km: float = 12.0, user: AuthUser = Depends(require_role("client", "admin"))):
    origin = Location(lat=lat, lng=lng)
    rows = load_available_drivers(vehicle_type)
    preliminary = []
    for d in rows:
        loc = d["location"]
        direct = haversine_km(lat, lng, float(loc["latitude"]), float(loc["longitude"]))
        if direct <= radius_km:
            preliminary.append((direct, d))
    preliminary.sort(key=lambda x: x[0]); preview = preliminary[:8]
    async def enrich(item):
        direct, d = item; loc = d["location"]
        rt = await route_info(Location(lat=float(loc["latitude"]), lng=float(loc["longitude"])), origin)
        vehicle = d["vehicle"]
        return {"driver_id": d["user_id"], "lat": float(loc["latitude"]), "lng": float(loc["longitude"]), "heading": loc.get("heading"), "speed_kmh": loc.get("speed_kmh"), "accuracy_m": loc.get("accuracy_m"), "updated_at": loc.get("updated_at"), "distance_km": rt["distance_km"], "eta_min": rt["duration_min"], "rating": float(d.get("rating") or 5.0), "total_rides": int(d.get("total_rides") or 0), "vehicle": {"id": vehicle.get("id"), "make": vehicle.get("make") or "Toyota", "model": vehicle.get("model") or "Corolla", "color": vehicle.get("color") or "Vert / Blanc", "plate_number": vehicle.get("plate_number"), "vehicle_type": vehicle.get("vehicle_type"), "seats": vehicle.get("seats")}}
    enriched = await asyncio.gather(*(enrich(x) for x in preview)) if preview else []
    enriched.sort(key=lambda x: (x["eta_min"], x["distance_km"]))
    return {"items": enriched, "count": len(enriched), "radius_km": radius_km}

@app.get("/v1/me")
def me(user: AuthUser = Depends(current_user)):
    profile = db().table("profiles").select("*").eq("id", user.id).single().execute().data
    wallet = db().table("wallets").select("balance,currency").eq("user_id", user.id).single().execute().data
    return {"profile": profile, "wallet": wallet}

@app.post("/v1/rides")
async def create_ride(body: RideCreate, user: AuthUser = Depends(require_role("client", "admin"))):
    rt = await route_info(body.pickup, body.destination); price = price_for(body.vehicle_type, rt["distance_km"], rt["duration_min"])
    payload = {"client_id": user.id, "status": "searching", "pickup_address": body.pickup_address, "pickup_lat": body.pickup.lat, "pickup_lng": body.pickup.lng, "destination_address": body.destination_address, "destination_lat": body.destination.lat, "destination_lng": body.destination.lng, "requested_vehicle_type": body.vehicle_type, "estimated_distance_km": rt["distance_km"], "estimated_duration_min": rt["duration_min"], "estimated_price": price, "currency": "XAF", "optimized_route_polyline": rt.get("polyline"), "traffic_duration_min": rt.get("traffic_duration_min"), "eta_model_version": f"{rt['provider']}-route-v2"}
    ride = db().table("rides").insert(payload).execute().data[0]
    db().table("ride_events").insert({"ride_id": ride["id"], "event_type": "ride_created", "actor_user_id": user.id, "payload": {"payment_method": body.payment_method, "route_provider": rt["provider"], "route_quality": rt["route_quality"]}}).execute()
    return {"ride": ride, "route": rt}

@app.post("/v1/rides/{ride_id}/dispatch")
async def dispatch(ride_id: str, user: AuthUser = Depends(require_role("client", "admin"))):
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and ride["client_id"] != user.id:
        raise HTTPException(403, "Forbidden")
    rows = load_available_drivers(ride.get("requested_vehicle_type")); ranked = []
    for d in rows:
        loc = d["location"]; direct = haversine_km(float(ride["pickup_lat"]), float(ride["pickup_lng"]), float(loc["latitude"]), float(loc["longitude"]))
        if direct <= 20:
            ranked.append((direct, d))
    ranked.sort(key=lambda x: x[0]); top = ranked[:5]
    if not top:
        return {"matched": False, "candidates": 0, "reason": "no_available_driver"}
    async def score_candidate(item):
        direct, d = item; loc = d["location"]
        rt = await route_info(Location(lat=float(loc["latitude"]), lng=float(loc["longitude"])), Location(lat=float(ride["pickup_lat"]), lng=float(ride["pickup_lng"])))
        eta = rt["duration_min"]; distance = rt["distance_km"]; rating = float(d.get("rating") or 5.0); hist = min(100, math.log10(max(1, int(d.get("total_rides") or 0)) + 1) / 3 * 100)
        freshness_penalty = 0
        try:
            updated = datetime.fromisoformat(str(loc.get("updated_at")).replace("Z", "+00:00")); age = (datetime.now(timezone.utc) - updated).total_seconds(); freshness_penalty = min(8, max(0, age - 20) / 20)
        except Exception:
            freshness_penalty = 3
        score = round(0.48 * eta + 0.24 * distance + 0.18 * (5 - rating) + 0.06 * (100 - hist) / 10 + 0.04 * freshness_penalty, 4)
        return {"score": score, "eta": eta, "distance": distance, "driver": d, "route_provider": rt["provider"]}
    candidates = await asyncio.gather(*(score_candidate(x) for x in top)); candidates.sort(key=lambda x: x["score"]); best = candidates[0]; dr = best["driver"]; vh = dr["vehicle"]
    expires = (datetime.now(timezone.utc) + timedelta(seconds=25)).isoformat()
    offer = db().table("dispatch_offers").insert({"ride_id": ride_id, "driver_id": dr["user_id"], "vehicle_id": vh["id"], "distance_km": round(best["distance"], 2), "eta_min": best["eta"], "driver_rating": dr.get("rating"), "driver_total_rides": dr.get("total_rides"), "score": best["score"], "status": "offered", "expires_at": expires}).execute().data[0]
    db().table("rides").update({"driver_id": dr["user_id"], "vehicle_id": vh["id"], "driver_eta_min": best["eta"], "dispatch_score": best["score"], "dispatch_attempts": int(ride.get("dispatch_attempts") or 0) + 1}).eq("id", ride_id).execute()
    db().table("notifications").insert({"user_id": dr["user_id"], "title": "Nouvelle course FAST", "body": f"Passager à {round(best['distance'], 1)} km • ETA {best['eta']} min", "data": {"ride_id": ride_id, "offer_id": offer["id"]}}).execute()
    return {"matched": True, "offer": offer, "candidates": len(candidates), "top_candidates": [{"eta_min": c["eta"], "distance_km": round(c["distance"], 2), "rating": float(c["driver"].get("rating") or 5), "vehicle": {"make": c["driver"]["vehicle"].get("make"), "model": c["driver"]["vehicle"].get("model"), "color": c["driver"]["vehicle"].get("color")}} for c in candidates[:3]]}

@app.get("/v1/driver/offers/current")
def driver_current_offer(user: AuthUser = Depends(require_role("driver", "admin"))):
    rows = db().table("dispatch_offers").select("*").eq("driver_id", user.id).eq("status", "offered").order("offered_at", desc=True).limit(1).execute().data or []
    return {"offer": rows[0] if rows else None}

@app.post("/v1/driver/offers/{offer_id}/respond")
def driver_offer_respond(offer_id: str, body: OfferDecision, user: AuthUser = Depends(require_role("driver", "admin"))):
    offer = db().table("dispatch_offers").select("*").eq("id", offer_id).single().execute().data
    if not offer:
        raise HTTPException(404, "Offer not found")
    if user.role != "admin" and offer["driver_id"] != user.id:
        raise HTTPException(403, "Forbidden")
    if offer["status"] != "offered":
        raise HTTPException(409, "Offer already processed")
    now = datetime.now(timezone.utc).isoformat()
    if body.accept:
        db().table("dispatch_offers").update({"status": "accepted", "responded_at": now}).eq("id", offer_id).execute(); db().table("rides").update({"status": "accepted", "accepted_at": now}).eq("id", offer["ride_id"]).execute(); db().table("drivers").update({"status": "busy"}).eq("user_id", offer["driver_id"]).execute()
        ride = db().table("rides").select("client_id").eq("id", offer["ride_id"]).single().execute().data
        db().table("notifications").insert({"user_id": ride["client_id"], "title": "Chauffeur trouvé", "body": "Votre chauffeur FAST a accepté la course.", "data": {"ride_id": offer["ride_id"]}}).execute()
        return {"accepted": True, "ride_id": offer["ride_id"]}
    db().table("dispatch_offers").update({"status": "rejected", "responded_at": now}).eq("id", offer_id).execute(); db().table("rides").update({"driver_id": None, "vehicle_id": None, "driver_eta_min": None, "dispatch_score": None}).eq("id", offer["ride_id"]).execute()
    return {"accepted": False, "ride_id": offer["ride_id"], "redispatch": True}

@app.post("/v1/driver/location")
def update_driver_location(body: DriverLocation, user: AuthUser = Depends(require_role("driver", "admin"))):
    payload = {"driver_id": user.id, "latitude": body.lat, "longitude": body.lng, "heading": body.heading, "speed_kmh": body.speed_kmh, "accuracy_m": body.accuracy_m, "updated_at": datetime.now(timezone.utc).isoformat()}
    db().table("driver_locations").upsert(payload, on_conflict="driver_id").execute()
    return {"ok": True, "gps_quality": "high" if (body.accuracy_m or 99) <= 20 else "degraded"}

@app.post("/v1/driver/availability")
def driver_availability(body: DriverAvailability, user: AuthUser = Depends(require_role("driver", "admin"))):
    driver = db().table("drivers").select("is_verified").eq("user_id", user.id).single().execute().data
    if body.available and not driver.get("is_verified"):
        raise HTTPException(403, "Driver verification required")
    db().table("drivers").update({"status": "available" if body.available else "offline"}).eq("user_id", user.id).execute()
    return {"status": "available" if body.available else "offline"}

@app.get("/v1/rides/{ride_id}/navigation")
async def ride_navigation(ride_id: str, user: AuthUser = Depends(current_user)):
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and user.id not in {ride["client_id"], ride.get("driver_id")}:
        raise HTTPException(403, "Forbidden")
    if not ride.get("driver_id"):
        return {"active": False, "reason": "driver_not_assigned"}
    loc = db().table("driver_locations").select("*").eq("driver_id", ride["driver_id"]).single().execute().data
    if not loc:
        return {"active": False, "reason": "driver_location_missing"}
    origin = Location(lat=float(loc["latitude"]), lng=float(loc["longitude"])); target = Location(lat=float(ride["pickup_lat"]), lng=float(ride["pickup_lng"])) if ride["status"] in {"searching", "accepted", "driver_arriving"} else Location(lat=float(ride["destination_lat"]), lng=float(ride["destination_lng"]))
    rt = await route_info(origin, target)
    return {"active": True, "phase": "to_pickup" if ride["status"] in {"searching", "accepted", "driver_arriving"} else "to_destination", "driver_location": {"lat": float(loc["latitude"]), "lng": float(loc["longitude"]), "heading": loc.get("heading"), "speed_kmh": loc.get("speed_kmh"), "accuracy_m": loc.get("accuracy_m"), "updated_at": loc.get("updated_at")}, "eta_min": rt["duration_min"], "distance_km": rt["distance_km"], "polyline": rt.get("polyline"), "steps": rt.get("steps", [])[:8], "provider": rt["provider"], "route_quality": rt["route_quality"]}

@app.get("/v1/rides/{ride_id}")
async def get_ride(ride_id: str, user: AuthUser = Depends(current_user)):
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and user.id not in {ride["client_id"], ride.get("driver_id")}:
        raise HTTPException(403, "Forbidden")
    extra = {}
    if ride.get("driver_id"):
        loc = db().table("driver_locations").select("*").eq("driver_id", ride["driver_id"]).single().execute().data
        vehicle = db().table("vehicles").select("id,make,model,color,plate_number,seats,vehicle_type").eq("id", ride["vehicle_id"]).single().execute().data if ride.get("vehicle_id") else None
        driver = db().table("drivers").select("rating,total_rides").eq("user_id", ride["driver_id"]).single().execute().data
        prof = db().table("profiles").select("first_name,last_name,avatar_url").eq("id", ride["driver_id"]).single().execute().data
        extra = {"driver_location": loc, "vehicle": vehicle, "driver": {**(driver or {}), **(prof or {})}}
    return {"ride": ride, **extra}

@app.patch("/v1/rides/{ride_id}/status")
def update_ride_status(ride_id: str, body: RideStatusUpdate, user: AuthUser = Depends(current_user)):
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and user.id not in {ride["client_id"], ride.get("driver_id")}:
        raise HTTPException(403, "Forbidden")
    if body.status in {"driver_arriving", "in_progress", "completed"} and user.role not in {"driver", "admin"}:
        raise HTTPException(403, "Driver action required")
    changes = {"status": body.status}; now = datetime.now(timezone.utc).isoformat()
    if body.status == "in_progress": changes["started_at"] = now
    if body.status == "completed": changes["completed_at"] = now; changes["final_price"] = ride.get("estimated_price")
    if body.status == "cancelled": changes["cancelled_at"] = now
    db().table("rides").update(changes).eq("id", ride_id).execute(); db().table("ride_events").insert({"ride_id": ride_id, "event_type": body.status, "actor_user_id": user.id}).execute()
    if body.status in {"completed", "cancelled"} and ride.get("driver_id"):
        db().table("drivers").update({"status": "available"}).eq("user_id", ride["driver_id"]).execute()
    return {"ok": True, "status": body.status}

@app.get("/v1/rides/history")
def ride_history(user: AuthUser = Depends(current_user)):
    q = db().table("rides").select("*"); q = q.eq("client_id", user.id) if user.role == "client" else q.eq("driver_id", user.id)
    return {"items": q.order("created_at", desc=True).limit(100).execute().data or []}

@app.get("/v1/notifications")
def notifications(user: AuthUser = Depends(current_user)):
    return {"items": db().table("notifications").select("*").eq("user_id", user.id).order("created_at", desc=True).limit(50).execute().data or []}
