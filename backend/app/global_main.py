import asyncio
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .main import (
    GOOGLE_MAPS_API_KEY,
    AuthUser,
    app,
    current_user,
    db,
    haversine_km,
    route_info,
)


# Remove the Congo-only route handlers imported from main.py before registering
# the global implementations below. The rest of FAST keeps using the same app.
_REPLACED = {
    ("/v1/places/autocomplete", "GET"),
    ("/v1/routes/estimate", "POST"),
    ("/v1/nearby-drivers", "GET"),
    ("/v1/rides", "POST"),
    ("/v1/rides/{ride_id}/dispatch", "POST"),
    ("/v1/driver/location", "POST"),
}

app.router.routes = [
    r
    for r in app.router.routes
    if not any((getattr(r, "path", None), method) in _REPLACED for method in (getattr(r, "methods", None) or set()))
]


class GlobalLocation(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class GlobalRideCreate(BaseModel):
    pickup_address: str
    pickup: GlobalLocation
    destination_address: str
    destination: GlobalLocation
    vehicle_type: str = "standard"
    payment_method: str = "wallet"


class GlobalDriverLocation(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    heading: Optional[float] = None
    speed_kmh: Optional[float] = None
    accuracy_m: Optional[float] = None


_country_cache: dict[str, tuple[float, dict]] = {}
_market_cache: dict[str, tuple[float, dict]] = {}


def _cache_get(store: dict, key: str):
    item = store.get(key)
    if not item:
        return None
    expires_at, value = item
    if expires_at <= datetime.now(timezone.utc).timestamp():
        store.pop(key, None)
        return None
    return value


def _cache_put(store: dict, key: str, value: dict, ttl_seconds: int):
    store[key] = (datetime.now(timezone.utc).timestamp() + ttl_seconds, value)


def _fallback_country(lat: float, lng: float) -> dict:
    # Safe fallback for the two markets already configured. Google reverse
    # geocoding handles the rest of the world when available.
    if 41.0 <= lat <= 51.8 and -5.8 <= lng <= 10.0:
        return {"country_code": "FR", "country_name": "France"}
    if -5.2 <= lat <= 3.8 and 11.0 <= lng <= 19.0:
        return {"country_code": "CG", "country_name": "Congo"}
    return {"country_code": "ZZ", "country_name": "International"}


async def country_for_location(lat: float, lng: float) -> dict:
    key = f"{round(lat, 2)}:{round(lng, 2)}"
    cached = _cache_get(_country_cache, key)
    if cached:
        return cached

    result = None
    if GOOGLE_MAPS_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=7) as client:
                r = await client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY, "language": "fr"},
                )
            if r.status_code == 200:
                payload = r.json()
                for item in payload.get("results", []):
                    for comp in item.get("address_components", []):
                        if "country" in comp.get("types", []):
                            result = {
                                "country_code": str(comp.get("short_name") or "ZZ").upper(),
                                "country_name": comp.get("long_name") or "International",
                            }
                            break
                    if result:
                        break
        except Exception:
            result = None

    result = result or _fallback_country(lat, lng)
    _cache_put(_country_cache, key, result, 3600)
    return result


def market_for_country(country: dict) -> dict:
    code = str(country.get("country_code") or "ZZ").upper()
    cached = _cache_get(_market_cache, code)
    if cached:
        return cached
    rows = (
        db()
        .table("market_configs")
        .select("*")
        .eq("country_code", code)
        .eq("enabled", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        market = rows[0]
    else:
        market = {
            "country_code": code,
            "country_name": country.get("country_name") or "International",
            "currency": "USD",
            "locale": "en-US",
            "enabled": True,
            "payment_methods": ["card", "cash", "wallet"],
            "payout_methods": ["bank"],
            "mobile_money_operators": [],
            "document_requirements": [
                "identity",
                "license",
                "vehicle_registration",
                "insurance",
                "driver_photo",
                "address_proof",
            ],
        }
    _cache_put(_market_cache, code, market, 60)
    return market


def price_for_market(country_code: str, vehicle_type: str, distance_km: float, duration_min: int):
    rows = (
        db()
        .table("market_pricing")
        .select("*")
        .eq("country_code", country_code)
        .eq("service_type", vehicle_type)
        .eq("is_active", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        p = rows[0]
        amount = (
            float(p.get("base_fare") or 0)
            + distance_km * float(p.get("per_km") or 0)
            + duration_min * float(p.get("per_minute") or 0)
            + float(p.get("booking_fee") or 0)
        )
        minimum = float(p.get("minimum_fare") or 0)
        currency = p.get("currency") or "USD"
        precision = 0 if currency in {"XAF", "XOF", "JPY"} else 2
        return round(max(minimum, amount), precision), currency

    # Generic international fallback until the market is configured in admin.
    base = {"standard": 2.5, "comfort": 4.0, "xl": 5.0, "moto": 2.0}.get(vehicle_type, 2.5)
    per_km = {"standard": 1.2, "comfort": 1.6, "xl": 2.0, "moto": 0.9}.get(vehicle_type, 1.2)
    per_min = {"standard": 0.2, "comfort": 0.25, "xl": 0.3, "moto": 0.15}.get(vehicle_type, 0.2)
    return round(max(5.0, base + distance_km * per_km + duration_min * per_min), 2), "USD"


def global_driver_rows(lat: float, lng: float, country_code: str, vehicle_type: str, limit: int = 100):
    return (
        db()
        .rpc(
            "fast_global_available_drivers",
            {
                "p_lat": lat,
                "p_lng": lng,
                "p_country_code": country_code,
                "p_vehicle_type": vehicle_type,
                "p_limit": max(1, min(limit, 200)),
            },
        )
        .execute()
        .data
        or []
    )


@app.get("/v1/market")
async def current_market(lat: float, lng: float):
    country = await country_for_location(lat, lng)
    market = market_for_country(country)
    return {"country": country, "market": market}


@app.get("/v1/places/autocomplete")
async def autocomplete_global(
    q: str = Query(min_length=2, max_length=120),
    lat: Optional[float] = None,
    lng: Optional[float] = None,
):
    q_clean = " ".join(q.strip().split())
    if GOOGLE_MAPS_API_KEY:
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
        }
        body = {"input": q_clean, "languageCode": "fr"}
        if lat is not None and lng is not None:
            body["locationBias"] = {
                "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 50000.0}
            }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.post("https://places.googleapis.com/v1/places:autocomplete", headers=headers, json=body)
            if r.status_code == 200:
                items = []
                for s in r.json().get("suggestions", []):
                    p = s.get("placePrediction", {})
                    if p.get("placeId") and p.get("text", {}).get("text"):
                        items.append({"id": p["placeId"], "label": p["text"]["text"], "provider": "google"})
                return {"items": items}
        except Exception:
            pass

    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "FAST-N1/6.0"}) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q_clean, "format": "jsonv2", "limit": 6, "addressdetails": 1},
            )
        return {
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
    except Exception:
        return {"items": []}


@app.post("/v1/routes/estimate")
async def estimate_route_global(body: GlobalRideCreate):
    rt = await route_info(body.pickup, body.destination)
    country = await country_for_location(body.pickup.lat, body.pickup.lng)
    market = market_for_country(country)
    price, currency = price_for_market(country["country_code"], body.vehicle_type, rt["distance_km"], rt["duration_min"])
    return {
        **rt,
        "estimated_price": price,
        "currency": currency,
        "vehicle_type": body.vehicle_type,
        "country": country,
        "market": market,
    }


@app.get("/v1/nearby-drivers")
async def nearby_drivers_global(
    lat: float,
    lng: float,
    vehicle_type: str = "standard",
    radius_km: float = 12.0,
    user: AuthUser = Depends(current_user),
):
    if user.role not in {"client", "admin"}:
        raise HTTPException(403, "Forbidden")
    country = await country_for_location(lat, lng)
    rows = global_driver_rows(lat, lng, country["country_code"], vehicle_type, 50)
    # Nearby preview stays local on the map. Dispatch itself can expand across the
    # same country if nobody is close.
    local_rows = [r for r in rows if float(r.get("distance_km") or 999999) <= max(1.0, radius_km)]
    preview = local_rows[:5]
    origin = GlobalLocation(lat=lat, lng=lng)

    async def enrich(d):
        rt = await route_info(GlobalLocation(lat=float(d["latitude"]), lng=float(d["longitude"])), origin)
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
            "country_code": d.get("country_code"),
            "vehicle": {
                "id": d.get("vehicle_id"),
                "make": d.get("make") or "FAST",
                "model": d.get("model") or "Vehicle",
                "color": d.get("color"),
                "plate_number": d.get("plate_number"),
                "vehicle_type": d.get("vehicle_type"),
                "seats": d.get("seats"),
            },
        }

    enriched = await asyncio.gather(*(enrich(x) for x in preview)) if preview else []
    enriched.sort(key=lambda x: (x["eta_min"], x["distance_km"]))
    return {
        "items": enriched,
        "count": len(enriched),
        "radius_km": radius_km,
        "country": country,
        "same_country_only": True,
    }


@app.post("/v1/rides")
async def create_ride_global(body: GlobalRideCreate, user: AuthUser = Depends(current_user)):
    if user.role not in {"client", "admin"}:
        raise HTTPException(403, "Forbidden")
    rt = await route_info(body.pickup, body.destination)
    pickup_country, destination_country = await asyncio.gather(
        country_for_location(body.pickup.lat, body.pickup.lng),
        country_for_location(body.destination.lat, body.destination.lng),
    )
    market = market_for_country(pickup_country)
    allowed_methods = market.get("payment_methods") or ["card", "cash", "wallet"]
    if body.payment_method not in allowed_methods:
        raise HTTPException(400, "Payment method not available in this country")
    price, currency = price_for_market(
        pickup_country["country_code"], body.vehicle_type, rt["distance_km"], rt["duration_min"]
    )
    payload = {
        "client_id": user.id,
        "status": "searching",
        "pickup_address": body.pickup_address,
        "pickup_lat": body.pickup.lat,
        "pickup_lng": body.pickup.lng,
        "pickup_country_code": pickup_country["country_code"],
        "pickup_country_name": pickup_country["country_name"],
        "destination_address": body.destination_address,
        "destination_lat": body.destination.lat,
        "destination_lng": body.destination.lng,
        "destination_country_code": destination_country["country_code"],
        "destination_country_name": destination_country["country_name"],
        "requested_vehicle_type": body.vehicle_type,
        "estimated_distance_km": rt["distance_km"],
        "estimated_duration_min": rt["duration_min"],
        "estimated_price": price,
        "currency": currency,
        "payment_method": body.payment_method,
        "optimized_route_polyline": rt.get("polyline"),
        "traffic_duration_min": rt.get("traffic_duration_min"),
        "eta_model_version": f"{rt['provider']}-global-v1",
    }
    ride = db().table("rides").insert(payload).execute().data[0]
    db().table("profiles").update({"country_code": pickup_country["country_code"]}).eq("id", user.id).execute()
    db().table("ride_events").insert(
        {
            "ride_id": ride["id"],
            "event_type": "ride_created",
            "actor_user_id": user.id,
            "payload": {
                "payment_method": body.payment_method,
                "country_code": pickup_country["country_code"],
                "route_provider": rt["provider"],
                "route_quality": rt["route_quality"],
            },
        }
    ).execute()
    return {"ride": ride, "route": {**rt, "market": market, "country": pickup_country}}


@app.post("/v1/rides/{ride_id}/dispatch")
async def dispatch_global(ride_id: str, user: AuthUser = Depends(current_user)):
    if user.role not in {"client", "admin"}:
        raise HTTPException(403, "Forbidden")
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and ride["client_id"] != user.id:
        raise HTTPException(403, "Forbidden")

    country_code = ride.get("pickup_country_code")
    if not country_code:
        country = await country_for_location(float(ride["pickup_lat"]), float(ride["pickup_lng"]))
        country_code = country["country_code"]
        db().table("rides").update(
            {"pickup_country_code": country_code, "pickup_country_name": country.get("country_name")}
        ).eq("id", ride_id).execute()

    now = datetime.now(timezone.utc)
    db().table("dispatch_offers").update({"status": "expired"}).eq("ride_id", ride_id).eq("status", "offered").lt("expires_at", now.isoformat()).execute()

    rows = global_driver_rows(
        float(ride["pickup_lat"]),
        float(ride["pickup_lng"]),
        country_code,
        ride.get("requested_vehicle_type") or "standard",
        100,
    )
    if not rows:
        return {
            "matched": False,
            "candidates": 0,
            "reason": "no_available_driver_in_country",
            "country_code": country_code,
        }

    # Drivers are already ordered by straight-line distance in PostGIS. Score the
    # closest candidates with real road ETA and never cross the country boundary.
    async def score_candidate(d):
        rt = await route_info(
            GlobalLocation(lat=float(d["latitude"]), lng=float(d["longitude"])),
            GlobalLocation(lat=float(ride["pickup_lat"]), lng=float(ride["pickup_lng"])),
        )
        eta = rt["duration_min"]
        distance = rt["distance_km"]
        rating = float(d.get("rating") or 5.0)
        hist = min(100, math.log10(max(1, int(d.get("total_rides") or 0)) + 1) / 3 * 100)
        score = round(0.55 * eta + 0.30 * distance + 0.10 * (5 - rating) + 0.05 * (100 - hist) / 10, 4)
        return {"score": score, "eta": eta, "distance": distance, "driver": d}

    candidates = await asyncio.gather(*(score_candidate(x) for x in rows[:8]))
    candidates.sort(key=lambda x: (x["score"], x["distance"]))

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
            "data": {"ride_id": ride_id, "offer_id": offer["id"], "country_code": country_code},
        }
    ).execute()
    return {
        "matched": True,
        "offer": offer,
        "candidates": len(candidates),
        "country_code": country_code,
        "same_country_only": True,
    }


@app.post("/v1/driver/location")
async def update_driver_location_global(body: GlobalDriverLocation, user: AuthUser = Depends(current_user)):
    if user.role not in {"driver", "admin"}:
        raise HTTPException(403, "Forbidden")
    existing_rows = (
        db()
        .table("driver_locations")
        .select("latitude,longitude,country_code,country_name,country_detected_at")
        .eq("driver_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    existing = existing_rows[0] if existing_rows else None
    country = None
    if existing and existing.get("country_code"):
        age_ok = False
        try:
            detected = datetime.fromisoformat(str(existing.get("country_detected_at")).replace("Z", "+00:00"))
            age_ok = datetime.now(timezone.utc) - detected < timedelta(minutes=20)
        except Exception:
            age_ok = False
        moved = haversine_km(
            float(existing.get("latitude") or body.lat),
            float(existing.get("longitude") or body.lng),
            body.lat,
            body.lng,
        )
        if age_ok and moved < 25:
            country = {
                "country_code": existing.get("country_code"),
                "country_name": existing.get("country_name") or existing.get("country_code"),
            }
    if not country:
        country = await country_for_location(body.lat, body.lng)

    payload = {
        "driver_id": user.id,
        "latitude": body.lat,
        "longitude": body.lng,
        "heading": body.heading,
        "speed_kmh": body.speed_kmh,
        "accuracy_m": body.accuracy_m,
        "country_code": country["country_code"],
        "country_name": country["country_name"],
        "country_detected_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db().table("driver_locations").upsert(payload, on_conflict="driver_id").execute()
    db().table("profiles").update({"country_code": country["country_code"]}).eq("id", user.id).execute()
    return {
        "ok": True,
        "gps_quality": "high" if (body.accuracy_m or 99) <= 20 else "degraded",
        "country": country,
    }
