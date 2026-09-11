import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from .global_main import (
    AuthUser,
    GlobalLocation,
    app,
    country_for_location,
    current_user,
    db,
    global_driver_rows,
    market_for_country,
    price_for_market,
    route_info,
)

# Replace only the global pricing/create/dispatch routes. All other FAST routes
# continue to come from global_main/main.
_REPLACED = {
    ("/v1/routes/estimate", "POST"),
    ("/v1/rides", "POST"),
    ("/v1/rides/{ride_id}/dispatch", "POST"),
}
app.router.routes = [
    r
    for r in app.router.routes
    if not any((getattr(r, "path", None), method) in _REPLACED for method in (getattr(r, "methods", None) or set()))
]


class FlexibleRideCreate(BaseModel):
    pickup_address: str
    pickup: GlobalLocation
    destination_address: str
    destination: GlobalLocation
    vehicle_type: str = "standard"
    payment_method: str = "wallet"
    proposed_price: Optional[float] = Field(default=None, gt=0, le=1_000_000_000)


def _round_for_currency(value: float, currency: str) -> float:
    precision = 0 if str(currency).upper() in {"XAF", "XOF", "JPY"} else 2
    return round(float(value), precision)


def _price_label(value: float, currency: str) -> str:
    amount = _round_for_currency(value, currency)
    if str(currency).upper() in {"XAF", "XOF", "JPY"}:
        return f"{int(amount):,}".replace(",", " ") + f" {currency}"
    return f"{amount:.2f} {currency}"


@app.post("/v1/routes/estimate")
async def estimate_route_flexible(body: FlexibleRideCreate):
    rt = await route_info(body.pickup, body.destination)
    country = await country_for_location(body.pickup.lat, body.pickup.lng)
    market = market_for_country(country)
    standard_price, currency = price_for_market(
        country["country_code"], body.vehicle_type, rt["distance_km"], rt["duration_min"]
    )
    return {
        **rt,
        "estimated_price": standard_price,
        "standard_price": standard_price,
        "currency": currency,
        "vehicle_type": body.vehicle_type,
        "country": country,
        "market": market,
        "flexible_pricing": True,
    }


@app.post("/v1/rides")
async def create_ride_flexible(body: FlexibleRideCreate, user: AuthUser = Depends(current_user)):
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

    standard_price, currency = price_for_market(
        pickup_country["country_code"], body.vehicle_type, rt["distance_km"], rt["duration_min"]
    )
    proposed_price = None
    pricing_mode = "standard"
    selected_price = standard_price
    if body.proposed_price is not None:
        proposed_price = _round_for_currency(body.proposed_price, currency)
        if proposed_price <= 0:
            raise HTTPException(400, "Proposed price must be positive")
        pricing_mode = "flexible"
        selected_price = proposed_price

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
        # estimated_price remains the price FAST will use for this request so all
        # existing payment/history code keeps working. standard_price preserves
        # the reference tariff when the client proposes another amount.
        "standard_price": standard_price,
        "estimated_price": selected_price,
        "customer_proposed_price": proposed_price,
        "pricing_mode": pricing_mode,
        "currency": currency,
        "payment_method": body.payment_method,
        "optimized_route_polyline": rt.get("polyline"),
        "traffic_duration_min": rt.get("traffic_duration_min"),
        "eta_model_version": f"{rt['provider']}-global-flex-v1",
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
                "pricing_mode": pricing_mode,
                "standard_price": standard_price,
                "proposed_price": proposed_price,
                "selected_price": selected_price,
                "currency": currency,
            },
        }
    ).execute()
    return {
        "ride": ride,
        "route": {**rt, "market": market, "country": pickup_country, "currency": currency},
        "pricing": {
            "mode": pricing_mode,
            "standard_price": standard_price,
            "proposed_price": proposed_price,
            "selected_price": selected_price,
            "currency": currency,
        },
    }


@app.post("/v1/rides/{ride_id}/dispatch")
async def dispatch_flexible(ride_id: str, user: AuthUser = Depends(current_user)):
    if user.role not in {"client", "admin"}:
        raise HTTPException(403, "Forbidden")
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and ride["client_id"] != user.id:
        raise HTTPException(403, "Forbidden")
    if ride.get("status") != "searching":
        raise HTTPException(409, "ride_not_searching")

    country_code = ride.get("pickup_country_code")
    if not country_code:
        country = await country_for_location(float(ride["pickup_lat"]), float(ride["pickup_lng"]))
        country_code = country["country_code"]
        db().table("rides").update(
            {"pickup_country_code": country_code, "pickup_country_name": country.get("country_name")}
        ).eq("id", ride_id).execute()

    now = datetime.now(timezone.utc)
    db().table("dispatch_offers").update({"status": "expired"}).eq("ride_id", ride_id).eq("status", "offered").lt("expires_at", now.isoformat()).execute()

    # fast_global_available_drivers is deliberately strict: verified + available +
    # fresh GPS + requested vehicle type + exact pickup country, ordered by PostGIS
    # geographic distance. Keeping this order guarantees that the first driver we
    # can actually offer is the nearest eligible driver in the same country.
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

    nearest = None
    for driver in rows:
        active = (
            db()
            .table("dispatch_offers")
            .select("id")
            .eq("driver_id", driver["driver_id"])
            .eq("status", "offered")
            .gt("expires_at", now.isoformat())
            .limit(1)
            .execute()
            .data
            or []
        )
        if not active:
            nearest = driver
            break

    if nearest is None:
        return {"matched": False, "candidates": len(rows), "reason": "drivers_already_offered"}

    # Only one road ETA call is needed after the nearest eligible driver has been
    # selected. Distance ranking itself remains the authoritative dispatch rule.
    road = await route_info(
        GlobalLocation(lat=float(nearest["latitude"]), lng=float(nearest["longitude"])),
        GlobalLocation(lat=float(ride["pickup_lat"]), lng=float(ride["pickup_lng"])),
    )
    eta = int(road["duration_min"])
    road_distance = float(road["distance_km"])
    geographic_distance = float(nearest.get("distance_km") or road_distance)
    dispatch_score = round(geographic_distance, 4)

    pricing_mode = ride.get("pricing_mode") or "standard"
    standard_price = float(ride.get("standard_price") or ride.get("estimated_price") or 0)
    offered_price = float(ride.get("customer_proposed_price") or ride.get("estimated_price") or standard_price)
    currency = ride.get("currency") or "USD"

    expires = (now + timedelta(seconds=25)).isoformat()
    offer = (
        db()
        .table("dispatch_offers")
        .insert(
            {
                "ride_id": ride_id,
                "driver_id": nearest["driver_id"],
                "vehicle_id": nearest.get("vehicle_id"),
                "distance_km": round(road_distance, 2),
                "eta_min": eta,
                "driver_rating": nearest.get("rating"),
                "driver_total_rides": nearest.get("total_rides"),
                "score": dispatch_score,
                "status": "offered",
                "expires_at": expires,
                "standard_price": standard_price if standard_price > 0 else None,
                "offered_price": offered_price if offered_price > 0 else None,
                "currency": currency,
                "pricing_mode": pricing_mode,
            }
        )
        .execute()
        .data[0]
    )
    db().table("rides").update(
        {
            "driver_id": nearest["driver_id"],
            "vehicle_id": nearest.get("vehicle_id"),
            "driver_eta_min": eta,
            "dispatch_score": dispatch_score,
            "dispatch_attempts": int(ride.get("dispatch_attempts") or 0) + 1,
        }
    ).eq("id", ride_id).execute()

    price_text = _price_label(offered_price, currency)
    label = "Prix proposé" if pricing_mode == "flexible" else "Prix FAST"
    db().table("notifications").insert(
        {
            "user_id": nearest["driver_id"],
            "title": "Nouvelle course FAST",
            "body": f"{label} {price_text} • Passager à {round(road_distance, 1)} km • ETA {eta} min",
            "data": {
                "ride_id": ride_id,
                "offer_id": offer["id"],
                "country_code": country_code,
                "pricing_mode": pricing_mode,
                "offered_price": offered_price,
                "standard_price": standard_price,
                "currency": currency,
                "dispatch_rule": "nearest_same_country",
                "geographic_distance_km": round(geographic_distance, 3),
            },
        }
    ).execute()
    return {
        "matched": True,
        "offer": offer,
        "candidates": len(rows),
        "country_code": country_code,
        "same_country_only": True,
        "dispatch_rule": "nearest_same_country",
        "nearest_distance_km": round(geographic_distance, 3),
        "road_distance_km": round(road_distance, 2),
        "pricing": {
            "mode": pricing_mode,
            "standard_price": standard_price,
            "offered_price": offered_price,
            "currency": currency,
        },
    }
