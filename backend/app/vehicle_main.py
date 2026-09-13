from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from .flex_main import AuthUser, app, current_user, db
from .main import DriverAvailability, SUPABASE_URL, db_retry, require_role

_REPLACED = {
    ("/v1/rides/{ride_id}", "GET"),
    ("/v1/driver/availability", "POST"),
    ("/v1/rides/{ride_id}/status", "PATCH"),
}
app.router.routes = [
    r
    for r in app.router.routes
    if not any((getattr(r, "path", None), method) in _REPLACED for method in (getattr(r, "methods", None) or set()))
]


class RideStatusRequest(BaseModel):
    status: Literal["driver_arriving", "in_progress", "completed", "cancelled"]
    cancellation_reason: str | None = None
    cancellation_note: str | None = None


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


def _optional_data(factory, default=None):
    try:
        response = db_retry(factory)
        return response.data if response is not None else default
    except Exception:
        return default


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
        db_retry(lambda: db().table("rides").update(changes).eq("id", ride_id))
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
        if vehicle:
            vehicle = dict(vehicle)
            vehicle["photo_url"] = _signed_vehicle_photo(vehicle.get("photo_path"))

        driver = _optional_data(
            lambda: db().table("drivers").select("rating,total_rides").eq("user_id", ride["driver_id"]).single(),
            {},
        ) or {}
        prof = _optional_data(
            lambda: db().table("profiles").select("first_name,last_name,avatar_url").eq("id", ride["driver_id"]).single(),
            {},
        ) or {}
        extra = {"driver_location": loc, "vehicle": vehicle, "driver": {**driver, **prof}}

    return {"ride": ride, **extra}
