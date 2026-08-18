import asyncio
import hashlib
import math
import os
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hmwxwzfcpdvgzjgxruup.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
# Keep the existing configured key as a fallback when Vercel defines an empty variable.
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY") or "AIzaSyBWo0btwLFoZaRze_TkMxoWkOMWorNyIRw"
APP_VERSION = os.getenv("APP_VERSION") or "0.6.0"
MIN_ANDROID_VERSION = os.getenv("MIN_ANDROID_VERSION") or "5.12"
ANDROID_UPDATE_URL = os.getenv("ANDROID_UPDATE_URL", "")

app = FastAPI(title="FAST N°1 API", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_SERVICE_ROLE_KEY else None


def db():
    if _supabase is None:
        raise HTTPException(503, "Supabase server key is not configured")
    return _supabase


class TTLCache:
    def __init__(self, max_items: int = 512):
        self.max_items = max_items
        self.data: OrderedDict[str, tuple[float, object]] = OrderedDict()

    def get(self, key: str):
        item = self.data.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at <= time.monotonic():
            self.data.pop(key, None)
            return None
        self.data.move_to_end(key)
        return value

    def put(self, key: str, value, ttl: float):
        self.data[key] = (time.monotonic() + ttl, value)
        self.data.move_to_end(key)
        while len(self.data) > self.max_items:
            self.data.popitem(last=False)


_route_cache = TTLCache(800)
_place_cache = TTLCache(400)
_auth_cache = TTLCache(1000)
_config_cache = TTLCache(8)
_pricing_cache = TTLCache(16)


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

    cache_key = hashlib.sha256(token.encode()).hexdigest()
    cached = _auth_cache.get(cache_key)
    if cached:
        return AuthUser(**cached)

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Authentication service temporarily unavailable") from exc

    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired session")

    auth = r.json()
    profile = db().table("profiles").select("id,role").eq("id", auth["id"]).single().execute().data
    if not profile:
        raise HTTPException(403, "FAST profile missing")

    result = {"id": auth["id"], "role": str(profile["role"]), "email": auth.get("email")}
    # Small cache: removes repeated Auth + profile round trips during GPS/ride polling while
    # keeping revocation latency short.
    _auth_cache.put(cache_key, result, 10)
    return AuthUser(**result)


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
    labels = {
        "turn-left": "Tournez à gauche",
        "turn-right": "Tournez à droite",
        "turn-slight-left": "Légèrement à gauche",
        "turn-slight-right": "Légèrement à droite",
        "turn-sharp-left": "Virage serré à gauche",
        "turn-sharp-right": "Virage serré à droite",
        "straight": "Continuez tout droit",
        "roundabout-left": "Prenez le rond-point",
        "roundabout-right": "Prenez le rond-point",
        "uturn-left": "Faites demi-tour",
        "uturn-right": "Faites demi-tour",
        "depart": "Départ",
        "arrive": "Arrivée",
    }
    return labels.get(kind or "", "Continuez")


def route_cache_key(origin: Location, destination: Location) -> str:
    return f"{origin.lat:.4f}:{origin.lng:.4f}:{destination.lat:.4f}:{destination.lng:.4f}"


async def google_route(origin: Location, destination: Location):
    if not GOOGLE_MAPS_API_KEY:
        return None
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": ",".join(
            [
                "routes.distanceMeters",
                "routes.duration",
                "routes.staticDuration",
                "routes.polyline.encodedPolyline",
                "routes.description",
                "routes.travelAdvisory.speedReadingIntervals",
                "routes.legs.steps.distanceMeters",
                "routes.legs.steps.staticDuration",
                "routes.legs.steps.navigationInstruction.instructions",
                "routes.legs.steps.navigationInstruction.maneuver",
                "routes.legs.steps.polyline.encodedPolyline",
            ]
        ),
    }
    body = {
        "origin": {"location": {"latLng": {"latitude": origin.lat, "longitude": origin.lng}}},
        "destination": {"location": {"latLng": {"latitude": destination.lat, "longitude": destination.lng}}},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
        "computeAlternativeRoutes": True,
        "extraComputations": ["TRAFFIC_ON_POLYLINE"],
        "languageCode": "fr",
        "units": "METRIC",
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.post("https://routes.googleapis.com/directions/v2:computeRoutes", headers=headers, json=body)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    payload = r.json()
    if not payload.get("routes"):
        return None

    parsed = []
    for idx, rt in enumerate(payload["routes"][:3]):
        steps = []
        for leg in rt.get("legs", []):
            for step in leg.get("steps", []):
                ni = step.get("navigationInstruction", {})
                steps.append(
                    {
                        "instruction": ni.get("instructions") or maneuver_label(ni.get("maneuver")),
                        "maneuver": ni.get("maneuver"),
                        "distance_m": int(step.get("distanceMeters") or 0),
                        "duration_min": parse_seconds(step.get("staticDuration")),
                        "polyline": step.get("polyline", {}).get("encodedPolyline"),
                    }
                )
        parsed.append(
            {
                "distance_km": round(float(rt.get("distanceMeters", 0)) / 1000, 2),
                "duration_min": parse_seconds(rt.get("duration")),
                "static_duration_min": parse_seconds(rt.get("staticDuration")),
                "traffic_duration_min": parse_seconds(rt.get("duration")),
                "polyline": rt.get("polyline", {}).get("encodedPolyline"),
                "traffic": rt.get("travelAdvisory", {}).get("speedReadingIntervals", []),
                "steps": steps,
                "description": rt.get("description") or ("Itinéraire recommandé" if idx == 0 else f"Alternative {idx + 1}"),
                "provider": "google",
                "route_rank": idx + 1,
            }
        )
    best = parsed[0]
    best["alternatives"] = [
        {
            "distance_km": a["distance_km"],
            "duration_min": a["duration_min"],
            "description": a["description"],
            "polyline": a["polyline"],
        }
        for a in parsed[1:]
    ]
    best["route_quality"] = "premium_traffic"
    return best


async def osrm_route(origin: Location, destination: Location):
    coords = f"{origin.lng},{origin.lat};{destination.lng},{destination.lat}"
    params = {
        "overview": "full",
        "geometries": "polyline",
        "steps": "true",
        "alternatives": "true",
        "annotations": "false",
    }
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "FAST-N1/0.6"}) as client:
            r = await client.get(f"https://router.project-osrm.org/route/v1/driving/{coords}", params=params)
    except httpx.HTTPError:
        return None
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
                steps.append(
                    {
                        "instruction": text,
                        "maneuver": f"{kind or ''}-{modifier or ''}".strip("-"),
                        "distance_m": int(step.get("distance") or 0),
                        "duration_min": max(1, round(float(step.get("duration") or 0) / 60)),
                        "polyline": step.get("geometry"),
                    }
                )
        parsed.append(
            {
                "distance_km": round(float(rt.get("distance", 0)) / 1000, 2),
                "duration_min": max(1, round(float(rt.get("duration", 0)) / 60)),
                "static_duration_min": max(1, round(float(rt.get("duration", 0)) / 60)),
                "traffic_duration_min": None,
                "polyline": rt.get("geometry"),
                "traffic": [],
                "steps": steps,
                "description": "Itinéraire routier" if idx == 0 else f"Alternative {idx + 1}",
                "provider": "osrm",
                "route_rank": idx + 1,
            }
        )
    best = parsed[0]
    best["alternatives"] = [
        {
            "distance_km": a["distance_km"],
            "duration_min": a["duration_min"],
            "description": a["description"],
            "polyline": a["polyline"],
        }
        for a in parsed[1:]
    ]
    best["route_quality"] = "road_detailed"
    return best


async def route_info(origin: Location, destination: Location):
    key = route_cache_key(origin, destination)
    cached = _route_cache.get(key)
    if cached:
        return cached

    g = await google_route(origin, destination)
    if g:
        _route_cache.put(key, g, 30)
        return g
    o = await osrm_route(origin, destination)
    if o:
        _route_cache.put(key, o, 45)
        return o
    d = haversine_km(origin.lat, origin.lng, destination.lat, destination.lng)
    fallback = {
        "distance_km": round(d * 1.25, 2),
        "duration_min": max(4, round(d * 1.25 / 24 * 60)),
        "static_duration_min": max(4, round(d * 1.25 / 24 * 60)),
        "traffic_duration_min": None,
        "polyline": None,
        "traffic": [],
        "steps": [],
        "alternatives": [],
        "provider": "fallback",
        "route_quality": "estimated",
    }
    _route_cache.put(key, fallback, 20)
    return fallback


def price_for(vehicle_type: str, distance_km: float, duration_min: int):
    cache_key = f"pricing:{vehicle_type}"
    c = _pricing_cache.get(cache_key)
    if c is None:
        cfg = (
            db()
            .table("pricing_config")
            .select("*")
            .eq("service_type", vehicle_type)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
        )
        c = cfg[0] if cfg else False
        _pricing_cache.put(cache_key, c, 60)
    if c:
        return max(
            float(c["minimum_fare_xaf"]),
            round(
                float(c["base_fare_xaf"])
                + distance_km * float(c["per_km_xaf"])
                + duration_min * float(c["per_minute_xaf"])
                + float(c["booking_fee_xaf"])
            ),
        )
    base, km, minute, minimum = {
        "standard": (700, 350, 40, 1000),
        "comfort": (1100, 480, 50, 1500),
        "xl": (1500, 600, 60, 2000),
        "moto": (400, 240, 25, 700),
    }[vehicle_type]
    return max(minimum, round(base + distance_km * km + duration_min * minute))


def nearby_rows(lat: float, lng: float, radius_km: float, vehicle_type: str, limit: int = 20):
    try:
        return (
            db()
            .rpc(
                "nearby_available_drivers",
                {
                    "p_lat": lat,
                    "p_lng": lng,
                    "p_radius_km": max(0.1, min(radius_km, 50.0)),
                    "p_vehicle_type": vehicle_type,
                    "p_limit": max(1, min(limit, 50)),
                },
            )
            .execute()
            .data
            or []
        )
    except Exception:
        # Backward-compatible fallback if a deployment reaches a database before the migration.
        drivers = (
            db()
            .table("drivers")
            .select("user_id,rating,total_rides,status,is_verified")
            .eq("status", "available")
            .eq("is_verified", True)
            .limit(200)
            .execute()
            .data
            or []
        )
        ids = [d["user_id"] for d in drivers]
        if not ids:
            return []
        locations = db().table("driver_locations").select("*").in_("driver_id", ids).execute().data or []
        vehicles = (
            db()
            .table("vehicles")
            .select("*")
            .in_("driver_id", ids)
            .eq("is_active", True)
            .eq("vehicle_type", vehicle_type)
            .execute()
            .data
            or []
        )
        dmap = {d["user_id"]: d for d in drivers}
        lmap = {x["driver_id"]: x for x in locations}
        result = []
        for v in vehicles:
            loc = lmap.get(v["driver_id"])
            drv = dmap.get(v["driver_id"])
            if not loc or not drv:
                continue
            direct = haversine_km(lat, lng, float(loc["latitude"]), float(loc["longitude"]))
            if direct <= radius_km:
                result.append(
                    {
                        "driver_id": v["driver_id"],
                        "latitude": float(loc["latitude"]),
                        "longitude": float(loc["longitude"]),
                        "heading": loc.get("heading"),
                        "speed_kmh": loc.get("speed_kmh"),
                        "accuracy_m": loc.get("accuracy_m"),
                        "updated_at": loc.get("updated_at"),
                        "distance_km": direct,
                        "rating": drv.get("rating"),
                        "total_rides": drv.get("total_rides"),
                        "vehicle_id": v.get("id"),
                        "make": v.get("make"),
                        "model": v.get("model"),
                        "color": v.get("color"),
                        "plate_number": v.get("plate_number"),
                        "vehicle_type": v.get("vehicle_type"),
                        "seats": v.get("seats"),
                    }
                )
        result.sort(key=lambda x: x["distance_km"])
        return result[:limit]


@app.get("/")
def root():
    return {"service": "FAST N°1 API", "status": "online", "version": APP_VERSION, "score_target": "9/10"}


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "fast-n1",
        "version": APP_VERSION,
        "supabase_configured": bool(SUPABASE_SERVICE_ROLE_KEY),
        "google_maps_configured": bool(GOOGLE_MAPS_API_KEY),
        "routing_fallback": "OSRM road routing",
        "gps_backend": "live",
        "geospatial_dispatch": True,
        "route_cache": True,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/v1/config")
def config():
    cached = _config_cache.get("config")
    if cached is not None:
        return cached
    rows = db().table("app_settings").select("key,value").execute().data or []
    result = {r["key"]: r["value"] for r in rows}
    _config_cache.put("config", result, 60)
    return result


@app.post("/v1/version/check")
def version_check(body: VersionRequest):
    return {
        "current": body.version,
        "latest": APP_VERSION,
        "minimum": MIN_ANDROID_VERSION,
        "update_available": body.version != APP_VERSION,
        "update_url": ANDROID_UPDATE_URL,
    }


@app.get("/v1/places/autocomplete")
async def autocomplete(q: str = Query(min_length=2, max_length=120)):
    q_clean = " ".join(q.strip().split())
    cache_key = f"place:{q_clean.lower()}"
    cached = _place_cache.get(cache_key)
    if cached is not None:
        return cached

    if GOOGLE_MAPS_API_KEY:
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
        }
        body = {
            "input": q_clean,
            "includedRegionCodes": ["cg"],
            "locationBias": {
                "circle": {
                    "center": {"latitude": -4.2634, "longitude": 15.2429},
                    "radius": 50000.0,
                }
            },
            "languageCode": "fr",
        }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.post("https://places.googleapis.com/v1/places:autocomplete", headers=headers, json=body)
            if r.status_code == 200:
                items = []
                for s in r.json().get("suggestions", []):
                    p = s.get("placePrediction", {})
                    if p.get("placeId") and p.get("text", {}).get("text"):
                        items.append({"id": p.get("placeId"), "label": p.get("text", {}).get("text"), "provider": "google"})
                result = {"items": items}
                _place_cache.put(cache_key, result, 120)
                return result
        except httpx.HTTPError:
            pass

    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "FAST-N1/0.6 support=servaisgloire@hotmail.com"}) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q_clean, "format": "jsonv2", "limit": 6, "countrycodes": "cg", "addressdetails": 1},
            )
    except httpx.HTTPError:
        return {"items": []}
    result = {
        "items": [
            {
                "id": x.get("place_id"),
                "label": x.get("display_name"),
                "lat": float(x["lat"]),
                "lng": float(x["lon"]),
                "provider": "osm",
            }
            for x in (r.json() if r.status_code == 200 else [])
        ]
    }
    _place_cache.put(cache_key, result, 60)
    return result


@app.get("/v1/places/details")
async def place_details(place_id: str):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(400, "Google place details requires GOOGLE_MAPS_API_KEY")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"https://places.googleapis.com/v1/places/{place_id}",
                headers={
                    "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
                    "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Place lookup failed") from exc
    if r.status_code != 200:
        raise HTTPException(502, "Place lookup failed")
    p = r.json()
    loc = p.get("location", {})
    return {
        "id": p.get("id"),
        "label": p.get("formattedAddress") or p.get("displayName", {}).get("text"),
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
    }


@app.post("/v1/routes/estimate")
async def estimate_route(body: RideCreate):
    rt = await route_info(body.pickup, body.destination)
    price = price_for(body.vehicle_type, rt["distance_km"], rt["duration_min"])
    return {**rt, "estimated_price": price, "currency": "XAF", "vehicle_type": body.vehicle_type}


@app.get("/v1/nearby-drivers")
async def nearby_drivers(
    lat: float,
    lng: float,
    vehicle_type: str = "standard",
    radius_km: float = 12.0,
    user: AuthUser = Depends(require_role("client", "admin")),
):
    origin = Location(lat=lat, lng=lng)
    rows = nearby_rows(lat, lng, radius_km, vehicle_type, 12)
    preview = rows[:5]

    async def enrich(d):
        rt = await route_info(Location(lat=float(d["latitude"]), lng=float(d["longitude"])), origin)
        return {
            "driver_id": d["driver_id"],
            "lat": float(d["latitude"]),
            "lng": float(d["longitude"]),
            "heading": d.get("heading"),
            "speed_kmh": d.get("speed_kmh"),
            "accuracy_m": d.get("accuracy_m"),
            "updated_at": d.get("updated_at"),
            "distance_km": rt["distance_km"],
            "eta_min": rt["duration_min"],
            "rating": float(d.get("rating") or 5.0),
            "total_rides": int(d.get("total_rides") or 0),
            "vehicle": {
                "id": d.get("vehicle_id"),
                "make": d.get("make") or "Toyota",
                "model": d.get("model") or "Corolla",
                "color": d.get("color") or "Vert / Blanc",
                "plate_number": d.get("plate_number"),
                "vehicle_type": d.get("vehicle_type"),
                "seats": d.get("seats"),
            },
        }

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
    rt = await route_info(body.pickup, body.destination)
    price = price_for(body.vehicle_type, rt["distance_km"], rt["duration_min"])
    payload = {
        "client_id": user.id,
        "status": "searching",
        "pickup_address": body.pickup_address,
        "pickup_lat": body.pickup.lat,
        "pickup_lng": body.pickup.lng,
        "destination_address": body.destination_address,
        "destination_lat": body.destination.lat,
        "destination_lng": body.destination.lng,
        "requested_vehicle_type": body.vehicle_type,
        "estimated_distance_km": rt["distance_km"],
        "estimated_duration_min": rt["duration_min"],
        "estimated_price": price,
        "currency": "XAF",
        "optimized_route_polyline": rt.get("polyline"),
        "traffic_duration_min": rt.get("traffic_duration_min"),
        "eta_model_version": f"{rt['provider']}-route-v3",
    }
    ride = db().table("rides").insert(payload).execute().data[0]
    db().table("ride_events").insert(
        {
            "ride_id": ride["id"],
            "event_type": "ride_created",
            "actor_user_id": user.id,
            "payload": {"payment_method": body.payment_method, "route_provider": rt["provider"], "route_quality": rt["route_quality"]},
        }
    ).execute()
    return {"ride": ride, "route": rt}


@app.post("/v1/rides/{ride_id}/dispatch")
async def dispatch(ride_id: str, user: AuthUser = Depends(require_role("client", "admin"))):
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and ride["client_id"] != user.id:
        raise HTTPException(403, "Forbidden")

    # Expire old offers before selecting a new candidate. This avoids unique-index collisions
    # when clients retry dispatch after a timeout.
    now = datetime.now(timezone.utc)
    db().table("dispatch_offers").update({"status": "expired"}).eq("ride_id", ride_id).eq("status", "offered").lt("expires_at", now.isoformat()).execute()

    rows = nearby_rows(float(ride["pickup_lat"]), float(ride["pickup_lng"]), 20.0, ride.get("requested_vehicle_type") or "standard", 8)
    if not rows:
        return {"matched": False, "candidates": 0, "reason": "no_available_driver"}

    async def score_candidate(d):
        rt = await route_info(
            Location(lat=float(d["latitude"]), lng=float(d["longitude"])),
            Location(lat=float(ride["pickup_lat"]), lng=float(ride["pickup_lng"])),
        )
        eta = rt["duration_min"]
        distance = rt["distance_km"]
        rating = float(d.get("rating") or 5.0)
        hist = min(100, math.log10(max(1, int(d.get("total_rides") or 0)) + 1) / 3 * 100)
        freshness_penalty = 0
        try:
            updated = datetime.fromisoformat(str(d.get("updated_at")).replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - updated).total_seconds()
            freshness_penalty = min(8, max(0, age - 20) / 20)
        except Exception:
            freshness_penalty = 3
        score = round(0.48 * eta + 0.24 * distance + 0.18 * (5 - rating) + 0.06 * (100 - hist) / 10 + 0.04 * freshness_penalty, 4)
        return {"score": score, "eta": eta, "distance": distance, "driver": d, "route_provider": rt["provider"]}

    candidates = await asyncio.gather(*(score_candidate(x) for x in rows[:5]))
    candidates.sort(key=lambda x: x["score"])

    # Skip drivers that already have an active offer, then take the next scored driver.
    best = None
    for candidate in candidates:
        active = (
            db()
            .table("dispatch_offers")
            .select("id")
            .eq("driver_id", candidate["driver"]["driver_id"])
            .eq("status", "offered")
            .gt("expires_at", now.isoformat())
            .limit(1)
            .execute()
            .data
            or []
        )
        if not active:
            best = candidate
            break
    if best is None:
        return {"matched": False, "candidates": len(candidates), "reason": "drivers_already_offered"}

    dr = best["driver"]
    expires = (now + timedelta(seconds=25)).isoformat()
    offer = (
        db()
        .table("dispatch_offers")
        .insert(
            {
                "ride_id": ride_id,
                "driver_id": dr["driver_id"],
                "vehicle_id": dr.get("vehicle_id"),
                "distance_km": round(best["distance"], 2),
                "eta_min": best["eta"],
                "driver_rating": dr.get("rating"),
                "driver_total_rides": dr.get("total_rides"),
                "score": best["score"],
                "status": "offered",
                "expires_at": expires,
            }
        )
        .execute()
        .data[0]
    )
    db().table("rides").update(
        {
            "driver_id": dr["driver_id"],
            "vehicle_id": dr.get("vehicle_id"),
            "driver_eta_min": best["eta"],
            "dispatch_score": best["score"],
            "dispatch_attempts": int(ride.get("dispatch_attempts") or 0) + 1,
        }
    ).eq("id", ride_id).execute()
    db().table("notifications").insert(
        {
            "user_id": dr["driver_id"],
            "title": "Nouvelle course FAST",
            "body": f"Passager à {round(best['distance'], 1)} km • ETA {best['eta']} min",
            "data": {"ride_id": ride_id, "offer_id": offer["id"]},
        }
    ).execute()
    return {
        "matched": True,
        "offer": offer,
        "candidates": len(candidates),
        "top_candidates": [
            {
                "eta_min": c["eta"],
                "distance_km": round(c["distance"], 2),
                "rating": float(c["driver"].get("rating") or 5),
                "vehicle": {
                    "make": c["driver"].get("make"),
                    "model": c["driver"].get("model"),
                    "color": c["driver"].get("color"),
                },
            }
            for c in candidates[:3]
        ],
    }


@app.get("/v1/driver/offers/current")
def driver_current_offer(user: AuthUser = Depends(require_role("driver", "admin"))):
    now = datetime.now(timezone.utc).isoformat()
    rows = (
        db()
        .table("dispatch_offers")
        .select("*")
        .eq("driver_id", user.id)
        .eq("status", "offered")
        .gt("expires_at", now)
        .order("offered_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
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
    if offer.get("expires_at") and datetime.fromisoformat(str(offer["expires_at"]).replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        db().table("dispatch_offers").update({"status": "expired"}).eq("id", offer_id).execute()
        raise HTTPException(410, "Offer expired")

    now = datetime.now(timezone.utc).isoformat()
    if body.accept:
        db().table("dispatch_offers").update({"status": "accepted", "responded_at": now}).eq("id", offer_id).execute()
        db().table("rides").update({"status": "accepted", "accepted_at": now}).eq("id", offer["ride_id"]).execute()
        db().table("drivers").update({"status": "busy"}).eq("user_id", offer["driver_id"]).execute()
        ride = db().table("rides").select("client_id").eq("id", offer["ride_id"]).single().execute().data
        db().table("notifications").insert(
            {
                "user_id": ride["client_id"],
                "title": "Chauffeur trouvé",
                "body": "Votre chauffeur FAST a accepté la course.",
                "data": {"ride_id": offer["ride_id"]},
            }
        ).execute()
        return {"accepted": True, "ride_id": offer["ride_id"]}

    db().table("dispatch_offers").update({"status": "rejected", "responded_at": now}).eq("id", offer_id).execute()
    db().table("rides").update({"driver_id": None, "vehicle_id": None, "driver_eta_min": None, "dispatch_score": None}).eq("id", offer["ride_id"]).execute()
    return {"accepted": False, "ride_id": offer["ride_id"], "redispatch": True}


@app.post("/v1/driver/location")
def update_driver_location(body: DriverLocation, user: AuthUser = Depends(require_role("driver", "admin"))):
    payload = {
        "driver_id": user.id,
        "latitude": body.lat,
        "longitude": body.lng,
        "heading": body.heading,
        "speed_kmh": body.speed_kmh,
        "accuracy_m": body.accuracy_m,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db().table("driver_locations").upsert(payload, on_conflict="driver_id").execute()
    return {"ok": True, "gps_quality": "high" if (body.accuracy_m or 99) <= 20 else "degraded"}


@app.post("/v1/driver/availability")
def driver_availability(body: DriverAvailability, user: AuthUser = Depends(require_role("driver", "admin"))):
    driver = db().table("drivers").select("is_verified").eq("user_id", user.id).single().execute().data
    if not driver:
        raise HTTPException(404, "Driver profile missing")
    if body.available and not driver.get("is_verified"):
        raise HTTPException(403, "Driver verification required")
    db().table("drivers").update({"status": "available" if body.available else "offline"}).eq("user_id", user.id).execute()
    return {"status": "available" if body.available else "offline"}


# IMPORTANT: static /history is declared BEFORE /{ride_id}; otherwise FastAPI can route
# the word "history" into the dynamic UUID path.
@app.get("/v1/rides/history")
def ride_history(user: AuthUser = Depends(current_user)):
    q = db().table("rides").select("*")
    q = q.eq("client_id", user.id) if user.role == "client" else q.eq("driver_id", user.id)
    return {"items": q.order("created_at", desc=True).limit(100).execute().data or []}


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
    origin = Location(lat=float(loc["latitude"]), lng=float(loc["longitude"]))
    target = (
        Location(lat=float(ride["pickup_lat"]), lng=float(ride["pickup_lng"]))
        if ride["status"] in {"searching", "accepted", "driver_arriving"}
        else Location(lat=float(ride["destination_lat"]), lng=float(ride["destination_lng"]))
    )
    rt = await route_info(origin, target)
    return {
        "active": True,
        "phase": "to_pickup" if ride["status"] in {"searching", "accepted", "driver_arriving"} else "to_destination",
        "driver_location": {
            "lat": float(loc["latitude"]),
            "lng": float(loc["longitude"]),
            "heading": loc.get("heading"),
            "speed_kmh": loc.get("speed_kmh"),
            "accuracy_m": loc.get("accuracy_m"),
            "updated_at": loc.get("updated_at"),
        },
        "eta_min": rt["duration_min"],
        "distance_km": rt["distance_km"],
        "polyline": rt.get("polyline"),
        "steps": rt.get("steps", [])[:8],
        "provider": rt["provider"],
        "route_quality": rt["route_quality"],
    }


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
        vehicle = (
            db()
            .table("vehicles")
            .select("id,make,model,color,plate_number,seats,vehicle_type")
            .eq("id", ride["vehicle_id"])
            .single()
            .execute()
            .data
            if ride.get("vehicle_id")
            else None
        )
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
    changes = {"status": body.status}
    now = datetime.now(timezone.utc).isoformat()
    if body.status == "in_progress":
        changes["started_at"] = now
    if body.status == "completed":
        changes["completed_at"] = now
        changes["final_price"] = ride.get("estimated_price")
    if body.status == "cancelled":
        changes["cancelled_at"] = now
    db().table("rides").update(changes).eq("id", ride_id).execute()
    db().table("ride_events").insert({"ride_id": ride_id, "event_type": body.status, "actor_user_id": user.id}).execute()
    if body.status in {"completed", "cancelled"} and ride.get("driver_id"):
        db().table("drivers").update({"status": "available"}).eq("user_id", ride["driver_id"]).execute()
    return {"ok": True, "status": body.status}


@app.get("/v1/notifications")
def notifications(user: AuthUser = Depends(current_user)):
    return {
        "items": db().table("notifications").select("*").eq("user_id", user.id).order("created_at", desc=True).limit(50).execute().data or []
    }
