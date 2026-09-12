from pathlib import Path

p=Path('backend/app/main.py')
s=p.read_text(encoding='utf-8')

needle='''def db():\n    if _supabase is None:\n        raise HTTPException(503, "Supabase server key is not configured")\n    return _supabase\n'''
replacement='''def db():\n    if _supabase is None:\n        raise HTTPException(503, "Supabase server key is not configured")\n    return _supabase\n\n\ndef db_retry(factory, attempts: int = 3, base_delay: float = 0.18):\n    \"\"\"Execute a fresh PostgREST/Supabase query with short exponential retry.\n\n    Supabase can occasionally return a transient gateway timeout. Rebuilding the query\n    for every attempt avoids reusing a consumed request builder. Persistent failures are\n    converted to a controlled 503 instead of an unhandled ASGI exception.\n    \"\"\"\n    last = None\n    for attempt in range(max(1, attempts)):\n        try:\n            return factory().execute()\n        except HTTPException:\n            raise\n        except Exception as exc:\n            last = exc\n            if attempt + 1 < attempts:\n                time.sleep(base_delay * (2 ** attempt))\n    raise HTTPException(503, "FAST data service temporarily unavailable") from last\n'''
if 'def db_retry(' not in s:
    if needle not in s: raise SystemExit('db() anchor not found')
    s=s.replace(needle,replacement,1)

cache_anchor='_pricing_cache = TTLCache(16)\n'
if '_last_good_config' not in s:
    s=s.replace(cache_anchor,cache_anchor+'_last_good_config: dict[str, object] = {}\n',1)

old='''    profile = db().table("profiles").select("id,role").eq("id", auth["id"]).single().execute().data\n'''
new='''    profile = db_retry(lambda: db().table("profiles").select("id,role").eq("id", auth["id"]).single()).data\n'''
if old in s:s=s.replace(old,new,1)

old='''        cfg = (\n            db()\n            .table("pricing_config")\n            .select("*")\n            .eq("service_type", vehicle_type)\n            .eq("is_active", True)\n            .limit(1)\n            .execute()\n            .data\n        )\n        c = cfg[0] if cfg else False\n'''
new='''        try:\n            cfg = db_retry(\n                lambda: db()\n                .table("pricing_config")\n                .select("*")\n                .eq("service_type", vehicle_type)\n                .eq("is_active", True)\n                .limit(1)\n            ).data or []\n        except HTTPException:\n            cfg = []\n        c = cfg[0] if cfg else False\n'''
if old in s:s=s.replace(old,new,1)

old='''@app.get("/v1/config")\ndef config():\n    cached = _config_cache.get("config")\n    if cached is not None:\n        return cached\n    rows = db().table("app_settings").select("key,value").execute().data or []\n    result = {r["key"]: r["value"] for r in rows}\n    _config_cache.put("config", result, 60)\n    return result\n'''
new='''@app.get("/v1/config")\ndef config():\n    cached = _config_cache.get("config")\n    if cached is not None:\n        return cached\n    try:\n        rows = db_retry(lambda: db().table("app_settings").select("key,value")).data or []\n        result = {r["key"]: r["value"] for r in rows}\n        _last_good_config.clear()\n        _last_good_config.update(result)\n        _config_cache.put("config", result, 60)\n        return result\n    except HTTPException:\n        # Configuration is safe to serve stale during a short Supabase outage.\n        return dict(_last_good_config)\n'''
if old not in s: raise SystemExit('config block not found')
s=s.replace(old,new,1)

old='''@app.get("/v1/driver/offers/current")\ndef driver_current_offer(user: AuthUser = Depends(require_role("driver", "admin"))):\n    now = datetime.now(timezone.utc).isoformat()\n    rows = (\n        db()\n        .table("dispatch_offers")\n        .select("*")\n        .eq("driver_id", user.id)\n        .eq("status", "offered")\n        .gt("expires_at", now)\n        .order("offered_at", desc=True)\n        .limit(1)\n        .execute()\n        .data\n        or []\n    )\n    return {"offer": rows[0] if rows else None}\n'''
new='''@app.get("/v1/driver/offers/current")\ndef driver_current_offer(user: AuthUser = Depends(require_role("driver", "admin"))):\n    now = datetime.now(timezone.utc).isoformat()\n    rows = db_retry(\n        lambda: db()\n        .table("dispatch_offers")\n        .select("*")\n        .eq("driver_id", user.id)\n        .eq("status", "offered")\n        .gt("expires_at", now)\n        .order("offered_at", desc=True)\n        .limit(1)\n    ).data or []\n    return {"offer": rows[0] if rows else None}\n'''
if old not in s: raise SystemExit('current offer block not found')
s=s.replace(old,new,1)

old='''    db().table("driver_locations").upsert(payload, on_conflict="driver_id").execute()\n    return {"ok": True, "gps_quality": "high" if (body.accuracy_m or 99) <= 20 else "degraded"}\n'''
new='''    db_retry(lambda: db().table("driver_locations").upsert(payload, on_conflict="driver_id"))\n    return {"ok": True, "gps_quality": "high" if (body.accuracy_m or 99) <= 20 else "degraded"}\n'''
if old in s:s=s.replace(old,new,1)

old='''async def ride_navigation(ride_id: str, user: AuthUser = Depends(current_user)):\n    ride = db().table("rides").select("*").eq("id", ride_id).single().execute().data\n'''
new='''async def ride_navigation(ride_id: str, user: AuthUser = Depends(current_user)):\n    ride = db_retry(lambda: db().table("rides").select("*").eq("id", ride_id).single()).data\n'''
if old not in s: raise SystemExit('navigation ride anchor not found')
s=s.replace(old,new,1)
old='''    loc = db().table("driver_locations").select("*").eq("driver_id", ride["driver_id"]).single().execute().data\n'''
new='''    loc = db_retry(lambda: db().table("driver_locations").select("*").eq("driver_id", ride["driver_id"]).single()).data\n'''
if old not in s: raise SystemExit('navigation loc anchor not found')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('FAST backend resilience patch applied')
