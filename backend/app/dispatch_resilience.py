import asyncio
import math
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException

from .flex_main import AuthUser, app, db
from .main import Location, nearby_rows, require_role, route_info

# Replace the legacy dispatch route with a retry-safe/concurrency-safe version.
app.router.routes = [
    r
    for r in app.router.routes
    if not (
        getattr(r, "path", None) == "/v1/rides/{ride_id}/dispatch"
        and "POST" in (getattr(r, "methods", set()) or set())
    )
]


def _active_offer_for_ride(ride_id: str, now_iso: str):
    return (
        db()
        .table("dispatch_offers")
        .select("*")
        .eq("ride_id", ride_id)
        .eq("status", "offered")
        .gt("expires_at", now_iso)
        .order("offered_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )


def _active_offer_for_driver(driver_id: str, now_iso: str):
    return (
        db()
        .table("dispatch_offers")
        .select("id,ride_id")
        .eq("driver_id", driver_id)
        .eq("status", "offered")
        .gt("expires_at", now_iso)
        .limit(1)
        .execute()
        .data
        or []
    )


@app.post("/v1/rides/{ride_id}/dispatch")
async def dispatch_resilient(
    ride_id: str,
    user: AuthUser = Depends(require_role("client", "admin")),
):
    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and ride["client_id"] != user.id:
        raise HTTPException(403, "Forbidden")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Repeated dispatch calls for the same ride are idempotent.
    existing = _active_offer_for_ride(ride_id, now_iso)
    if existing:
        return {
            "matched": True,
            "offer": existing[0],
            "candidates": 1,
            "idempotent": True,
        }

    if str(ride.get("status") or "") not in {"requested", "searching"}:
        if ride.get("driver_id"):
            return {
                "matched": True,
                "ride_id": ride_id,
                "driver_id": ride.get("driver_id"),
                "already_assigned": True,
            }
        raise HTTPException(409, "ride_not_dispatchable")

    # Clear only expired offers for this ride. A live offer is never overwritten.
    db().table("dispatch_offers").update({"status": "expired"}).eq("ride_id", ride_id).eq("status", "offered").lt("expires_at", now_iso).execute()

    rows = nearby_rows(
        float(ride["pickup_lat"]),
        float(ride["pickup_lng"]),
        20.0,
        ride.get("requested_vehicle_type") or "standard",
        12,
    )
    if not rows:
        return {"matched": False, "candidates": 0, "reason": "no_available_driver"}

    async def score_candidate(driver):
        route = await route_info(
            Location(lat=float(driver["latitude"]), lng=float(driver["longitude"])),
            Location(lat=float(ride["pickup_lat"]), lng=float(ride["pickup_lng"])),
        )
        eta = route["duration_min"]
        distance = route["distance_km"]
        rating = float(driver.get("rating") or 5.0)
        history = min(100, math.log10(max(1, int(driver.get("total_rides") or 0)) + 1) / 3 * 100)
        freshness_penalty = 0
        try:
            updated = datetime.fromisoformat(str(driver.get("updated_at")).replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - updated).total_seconds()
            freshness_penalty = min(8, max(0, age - 20) / 20)
        except Exception:
            freshness_penalty = 3
        score = round(
            0.48 * eta
            + 0.24 * distance
            + 0.18 * (5 - rating)
            + 0.06 * (100 - history) / 10
            + 0.04 * freshness_penalty,
            4,
        )
        return {
            "score": score,
            "eta": eta,
            "distance": distance,
            "driver": driver,
            "route_provider": route["provider"],
        }

    candidates = await asyncio.gather(*(score_candidate(x) for x in rows[:8]))
    candidates.sort(key=lambda x: x["score"])

    # The DB has unique partial indexes for one live offer per driver and per ride.
    # We intentionally attempt the insert and recover from a race instead of relying
    # on a check-then-insert window that can fail under concurrent clients.
    selected = None
    offer = None
    expires = (now + timedelta(seconds=25)).isoformat()

    for candidate in candidates:
        driver = candidate["driver"]
        driver_id = driver["driver_id"]
        if _active_offer_for_driver(driver_id, now_iso):
            continue
        try:
            offer = (
                db()
                .table("dispatch_offers")
                .insert(
                    {
                        "ride_id": ride_id,
                        "driver_id": driver_id,
                        "vehicle_id": driver.get("vehicle_id"),
                        "distance_km": round(candidate["distance"], 2),
                        "eta_min": candidate["eta"],
                        "driver_rating": driver.get("rating"),
                        "driver_total_rides": driver.get("total_rides"),
                        "score": candidate["score"],
                        "status": "offered",
                        "expires_at": expires,
                    }
                )
                .execute()
                .data[0]
            )
            selected = candidate
            break
        except Exception as exc:
            # Same ride may have been dispatched by a retry in another request.
            same_ride = _active_offer_for_ride(ride_id, now_iso)
            if same_ride:
                return {
                    "matched": True,
                    "offer": same_ride[0],
                    "candidates": len(candidates),
                    "idempotent": True,
                    "race_recovered": True,
                }
            # Or another client reserved this driver between our score and insert.
            if _active_offer_for_driver(driver_id, now_iso):
                continue
            raise HTTPException(503, "dispatch_temporarily_unavailable") from exc

    if not offer or not selected:
        return {
            "matched": False,
            "candidates": len(candidates),
            "reason": "drivers_already_offered",
        }

    driver = selected["driver"]
    db().table("rides").update(
        {
            "driver_id": driver["driver_id"],
            "vehicle_id": driver.get("vehicle_id"),
            "driver_eta_min": selected["eta"],
            "dispatch_score": selected["score"],
            "dispatch_attempts": int(ride.get("dispatch_attempts") or 0) + 1,
        }
    ).eq("id", ride_id).execute()

    try:
        db().table("notifications").insert(
            {
                "user_id": driver["driver_id"],
                "title": "Nouvelle course FAST",
                "body": f"Passager à {round(selected['distance'], 1)} km • ETA {selected['eta']} min",
                "data": {"ride_id": ride_id, "offer_id": offer["id"]},
            }
        ).execute()
    except Exception:
        # The dispatch itself is the source of truth; a notification write must
        # not turn a successful reservation into a false failure on the client.
        pass

    return {
        "matched": True,
        "offer": offer,
        "candidates": len(candidates),
        "race_recovered": False,
        "top_candidates": [
            {
                "eta_min": item["eta"],
                "distance_km": round(item["distance"], 2),
                "rating": float(item["driver"].get("rating") or 5),
            }
            for item in candidates[:3]
        ],
    }
