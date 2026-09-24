from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, Field

from .auth_proxy import router as auth_proxy_router
from .flex_main import AuthUser, app, current_user, db
from .main import APP_VERSION, DriverAvailability, SUPABASE_URL, db_retry, require_role


def _route_exists(path: str, method: str) -> bool:
    wanted = method.upper()
    return any(
        getattr(route, "path", None) == path and wanted in (getattr(route, "methods", None) or set())
        for route in app.router.routes
    )


# The Vercel entrypoint imports vehicle_main directly. Attach the mobile auth
# proxy here as well, so login/signup/recovery are guaranteed to exist in the
# production OpenAPI even if package bootstrap order changes.
if not _route_exists("/v1/auth/password", "POST"):
    app.include_router(auth_proxy_router)

_REPLACED = {
    ("/health", "GET"),
    ("/v1/rides/{ride_id}", "GET"),
    ("/v1/driver/availability", "POST"),
    ("/v1/rides/{ride_id}/status", "PATCH"),
    ("/v1/driver/offers/current", "GET"),
}
app.router.routes = [
    r
    for r in app.router.routes
    if not any((getattr(r, "path", None), method) in _REPLACED for method in (getattr(r, "methods", None) or set()))
]


@app.get("/health")
async def health_async(response: Response):
    response.headers["Cache-Control"] = "public, max-age=5"
    response.headers["CDN-Cache-Control"] = "public, s-maxage=10, stale-while-revalidate=30"
    response.headers["Vercel-CDN-Cache-Control"] = "public, s-maxage=10, stale-while-revalidate=30"
    return {"ok": True, "service": "fast-n1", "version": APP_VERSION}


class RideStatusRequest(BaseModel):
    status: Literal["driver_arriving", "in_progress", "completed", "cancelled"]
    cancellation_reason: str | None = None
    cancellation_note: str | None = None
    expected_current_status: Literal["searching", "accepted", "driver_arriving", "in_progress"] | None = None


class VehicleUpsertRequest(BaseModel):
    make: str = Field(default="", max_length=80)
    model: str = Field(default="", max_length=80)
    color: str = Field(default="", max_length=60)
    plate_number: str = Field(min_length=2, max_length=40)
    vehicle_type: Literal["standard", "comfort", "xl", "moto"] = "standard"
    seats: int = Field(default=4, ge=1, le=12)
    photo_path: str | None = Field(default=None, max_length=500)


def _signed_vehicle_photo(photo_path: str | None) -> str | None:
    path = str(photo_path or "").strip()
    if not path:
        return None
    try:
        payload = db().storage.from_("vehicle-photos").create_signed_url(path, 1800)
        if isinstance(payload, dict):
            data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
            url = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
            if url:
                return str(url) if str(url).startswith("http") else SUPABASE_URL.rstrip("/") + str(url)
    except Exception:
        return None
    return None


def _signed_driver_photo(avatar_url: str | None) -> str | None:
    path = str(avatar_url or "").strip()
    if not path:
        return None
    if path.startswith("https://") or path.startswith("http://"):
        return path
    try:
        payload = db().storage.from_("driver-photos").create_signed_url(path, 1800)
        if isinstance(payload, dict):
            data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
            url = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
            if url:
                return str(url) if str(url).startswith("http") else SUPABASE_URL.rstrip("/") + str(url)
    except Exception:
        return None
    return None


def _optional_data(factory, default=None):
    try:
        response = db_retry(factory)
        return response.data if response is not None else default
    except Exception:
        return default


def _decorate_vehicle(vehicle: dict | None) -> dict | None:
    if not vehicle:
        return None
    result = dict(vehicle)
    result["photo_url"] = _signed_vehicle_photo(result.get("photo_path"))
    return result


@app.get("/v1/driver/vehicle")
def driver_vehicle(user: AuthUser = Depends(require_role("driver", "admin"))):
    rows = (
        db_retry(
            lambda: db()
            .table("vehicles")
            .select("id,driver_id,make,model,color,plate_number,seats,vehicle_type,photo_path,is_active")
            .eq("driver_id", user.id)
            .eq("is_active", True)
            .limit(1)
        ).data
        or []
    )
    return {"vehicle": _decorate_vehicle(rows[0] if rows else None)}


@app.put("/v1/driver/vehicle")
def upsert_driver_vehicle(
    body: VehicleUpsertRequest,
    user: AuthUser = Depends(require_role("driver", "admin")),
):
    existing_rows = (
        db_retry(
            lambda: db()
            .table("vehicles")
            .select("id")
            .eq("driver_id", user.id)
            .eq("is_active", True)
            .limit(1)
        ).data
        or []
    )
    payload = {
        "driver_id": user.id,
        "make": body.make.strip(),
        "model": body.model.strip(),
        "color": body.color.strip(),
        "plate_number": body.plate_number.strip().upper(),
        "vehicle_type": body.vehicle_type,
        "seats": body.seats,
        "photo_path": (body.photo_path or "").strip() or None,
        "is_active": True,
    }
    if existing_rows:
        response = db_retry(lambda: db().table("vehicles").update(payload).eq("id", existing_rows[0]["id"]))
    else:
        response = db_retry(lambda: db().table("vehicles").insert(payload))
    rows = response.data or []
    vehicle = rows[0] if rows else _optional_data(
        lambda: db().table("vehicles").select("*").eq("driver_id", user.id).eq("is_active", True).limit(1),
        [],
    )
    if isinstance(vehicle, list):
        vehicle = vehicle[0] if vehicle else None
    return {"vehicle": _decorate_vehicle(vehicle)}


@app.get("/v1/driver/offers/current")
def driver_current_offer_enriched(user: AuthUser = Depends(require_role("driver", "admin"))):
    now = datetime.now(timezone.utc).isoformat()
    rows = (
        db_retry(
            lambda: db()
            .table("dispatch_offers")
            .select("*")
            .eq("driver_id", user.id)
            .eq("status", "offered")
            .gt("expires_at", now)
            .order("offered_at", desc=True)
            .limit(1)
        ).data
        or []
    )
    if not rows:
        return {"offer": None, "ride": None}
    offer = rows[0]
    ride = _optional_data(
        lambda: db()
        .table("rides")
        .select(
            "id,status,pickup_address,destination_address,estimated_distance_km,estimated_duration_min,"
            "estimated_price,standard_price,customer_proposed_price,currency,payment_method,requested_vehicle_type"
        )
        .eq("id", offer["ride_id"])
        .single(),
        None,
    )
    return {"offer": offer, "ride": ride}


@app.post("/v1/driver/availability")
def driver_availability_vehicle_required(
    body: DriverAvailability,
    user: AuthUser = Depends(require_role("driver", "admin")),
):
    driver = db_retry(lambda: db().table("drivers").select("is_verified").eq("user_id", user.id).single()).data
    if not driver:
        raise HTTPException(404, "Driver profile missing")
    if body.available and not driver.get("is_verified"):
        raise HTTPException(403, "Driver verification required")

    if body.available:
        vehicles = (
            db_retry(
                lambda: db()
                .table("vehicles")
                .select("id,plate_number,photo_path,is_active")
                .eq("driver_id", user.id)
                .eq("is_active", True)
                .limit(1)
            ).data
            or []
        )
        vehicle = vehicles[0] if vehicles else None
        if not vehicle or not str(vehicle.get("plate_number") or "").strip() or not str(vehicle.get("photo_path") or "").strip():
            raise HTTPException(409, "vehicle_profile_required")

    status = "available" if body.available else "offline"
    db_retry(
        lambda: db()
        .table("drivers")
        .update({"status": status, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", user.id)
    )
    return {"status": status}


def _ride_has_complete_addresses(ride: dict) -> bool:
    return all(
        [
            str(ride.get("pickup_address") or "").strip(),
            str(ride.get("destination_address") or "").strip(),
            ride.get("pickup_lat") is not None,
            ride.get("pickup_lng") is not None,
            ride.get("destination_lat") is not None,
            ride.get("destination_lng") is not None,
        ]
    )


def _default_cancellation_reason(user: AuthUser) -> str:
    if user.role == "driver":
        return "driver_cancelled"
    if user.role == "client":
        return "client_cancelled"
    return "admin_cancelled"


def _ride_final_price(ride: dict):
    return ride.get("agreed_price") or ride.get("customer_proposed_price") or ride.get("estimated_price")


@app.patch("/v1/rides/{ride_id}/status")
def update_ride_status_resilient(
    ride_id: str,
    body: RideStatusRequest,
    user: AuthUser = Depends(current_user),
):
    ride = db_retry(lambda: db().table("rides").select("*").eq("id", ride_id).single()).data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and user.id not in {ride["client_id"], ride.get("driver_id")}:
        raise HTTPException(403, "Forbidden")
    if body.status in {"driver_arriving", "in_progress", "completed"} and user.role not in {"driver", "admin"}:
        raise HTTPException(403, "Driver action required")

    current_status = str(ride.get("status") or "")
    if body.expected_current_status and current_status != body.expected_current_status:
        raise HTTPException(409, "stale_ride_state")
    if current_status == body.status:
        return {"ok": True, "status": body.status, "idempotent": True}
    if current_status in {"completed", "cancelled"}:
        raise HTTPException(409, "invalid_ride_transition")

    now = datetime.now(timezone.utc).isoformat()
    changes: dict[str, object] = {"status": body.status}

    if body.status == "in_progress":
        if not _ride_has_complete_addresses(ride):
            raise HTTPException(409, "addresses_not_ready")
        changes["pickup_confirmed"] = True
        changes["destination_confirmed"] = True
        changes["started_at"] = ride.get("started_at") or now

    if body.status == "completed":
        if current_status != "in_progress":
            raise HTTPException(409, "invalid_ride_transition")
        changes["completed_at"] = now
        changes["final_price"] = _ride_final_price(ride)
        if str(ride.get("payment_method") or "").lower() == "cash" and str(ride.get("payment_state") or "") not in {"cash_received", "paid"}:
            changes["payment_state"] = "cash_received"
            changes["payment_confirmed_at"] = ride.get("payment_confirmed_at") or now

    if body.status == "cancelled":
        changes["cancelled_at"] = now
        changes["cancellation_reason"] = (body.cancellation_reason or _default_cancellation_reason(user)).strip()[:120]
        changes["cancelled_by"] = user.id
        changes["cancelled_by_role"] = user.role
        if body.cancellation_note:
            changes["cancellation_note"] = body.cancellation_note.strip()[:500]

    try:
        def persist_status_change():
            query = db().table("rides").update(changes).eq("id", ride_id)
            if body.expected_current_status:
                query = query.eq("status", body.expected_current_status)
            return query

        result = db_retry(persist_status_change)
        if body.expected_current_status and not (getattr(result, "data", None) or []):
            raise HTTPException(409, "stale_ride_state")
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)
        if "ride_pin_not_verified" in message:
            raise HTTPException(409, "ride_pin_not_verified") from exc
        if "ride_payment_required" in message:
            raise HTTPException(409, "ride_payment_required") from exc
        if "addresses_not_confirmed" in message:
            raise HTTPException(409, "addresses_not_confirmed") from exc
        if "cancellation_reason_required" in message:
            raise HTTPException(409, "cancellation_reason_required") from exc
        if "cash_payment_not_confirmed" in message:
            raise HTTPException(409, "cash_payment_not_confirmed") from exc
        raise

    event_recorded = True
    try:
        db_retry(
            lambda: db().table("ride_events").insert(
                {"ride_id": ride_id, "event_type": body.status, "actor_user_id": user.id}
            )
        )
    except HTTPException:
        event_recorded = False

    if body.status in {"completed", "cancelled"} and ride.get("driver_id"):
        try:
            db_retry(
                lambda: db()
                .table("drivers")
                .update({"status": "available", "updated_at": now})
                .eq("user_id", ride["driver_id"])
            )
        except HTTPException:
            pass

    return {"ok": True, "status": body.status, "event_recorded": event_recorded}


@app.get("/v1/rides/{ride_id}")
async def get_ride_with_vehicle_photo(ride_id: str, user: AuthUser = Depends(current_user)):
    ride = db_retry(lambda: db().table("rides").select("*").eq("id", ride_id).single()).data
    if not ride:
        raise HTTPException(404, "Ride not found")
    if user.role != "admin" and user.id not in {ride["client_id"], ride.get("driver_id")}:
        raise HTTPException(403, "Forbidden")

    extra = {}
    if ride.get("driver_id"):
        loc = _optional_data(
            lambda: db().table("driver_locations").select("*").eq("driver_id", ride["driver_id"]).single(),
            None,
        )
        vehicle = (
            _optional_data(
                lambda: db()
                .table("vehicles")
                .select("id,make,model,color,plate_number,seats,vehicle_type,photo_path")
                .eq("id", ride["vehicle_id"])
                .single(),
                None,
            )
            if ride.get("vehicle_id")
            else None
        )
        vehicle = _decorate_vehicle(vehicle)

        driver = _optional_data(
            lambda: db().table("drivers").select("rating,total_rides").eq("user_id", ride["driver_id"]).single(),
            {},
        ) or {}
        prof = _optional_data(
            lambda: db().table("profiles").select("first_name,last_name,avatar_url").eq("id", ride["driver_id"]).single(),
            {},
        ) or {}
        prof = dict(prof)
        prof["photo_url"] = _signed_driver_photo(prof.get("avatar_url"))
        extra = {"driver_location": loc, "vehicle": vehicle, "driver": {**driver, **prof}}

    return {"ride": ride, **extra}
