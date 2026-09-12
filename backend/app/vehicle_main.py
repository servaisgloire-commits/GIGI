from datetime import datetime, timezone

from fastapi import Depends, HTTPException

from .flex_main import AuthUser, app, current_user, db
from .main import DriverAvailability, SUPABASE_URL, require_role

# FAST vehicle-complete entrypoint.
# The flexible/global routing stack remains intact; only the ride detail and
# availability endpoints are replaced so a driver cannot go online without a
# complete vehicle and the passenger receives a short-lived signed photo URL.
_REPLACED = {
    ("/v1/rides/{ride_id}", "GET"),
    ("/v1/driver/availability", "POST"),
}
app.router.routes = [
    r
    for r in app.router.routes
    if not any((getattr(r, "path", None), method) in _REPLACED for method in (getattr(r, "methods", None) or set()))
]


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


@app.post("/v1/driver/availability")
def driver_availability_vehicle_required(
    body: DriverAvailability,
    user: AuthUser = Depends(require_role("driver", "admin")),
):
    driver = db().table("drivers").select("is_verified").eq("user_id", user.id).single().execute().data
    if not driver:
        raise HTTPException(404, "Driver profile missing")
    if body.available and not driver.get("is_verified"):
        raise HTTPException(403, "Driver verification required")

    if body.available:
        vehicles = (
            db()
            .table("vehicles")
            .select("id,plate_number,photo_path,is_active")
            .eq("driver_id", user.id)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        vehicle = vehicles[0] if vehicles else None
        if not vehicle or not str(vehicle.get("plate_number") or "").strip() or not str(vehicle.get("photo_path") or "").strip():
            raise HTTPException(409, "vehicle_profile_required")

    status = "available" if body.available else "offline"
    db().table("drivers").update({"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("user_id", user.id).execute()
    return {"status": status}


@app.get("/v1/rides/{ride_id}")
async def get_ride_with_vehicle_photo(ride_id: str, user: AuthUser = Depends(current_user)):
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
            .select("id,make,model,color,plate_number,seats,vehicle_type,photo_path")
            .eq("id", ride["vehicle_id"])
            .single()
            .execute()
            .data
            if ride.get("vehicle_id")
            else None
        )
        if vehicle:
            vehicle = dict(vehicle)
            vehicle["photo_url"] = _signed_vehicle_photo(vehicle.get("photo_path"))

        driver = db().table("drivers").select("rating,total_rides").eq("user_id", ride["driver_id"]).single().execute().data
        prof = db().table("profiles").select("first_name,last_name,avatar_url").eq("id", ride["driver_id"]).single().execute().data
        extra = {"driver_location": loc, "vehicle": vehicle, "driver": {**(driver or {}), **(prof or {})}}

    return {"ride": ride, **extra}
