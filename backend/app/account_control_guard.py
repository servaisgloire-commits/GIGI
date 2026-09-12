"""Administrative account gate shared by all authenticated FAST API routes.

Supabase stores the administrative decision while the API enforces it. Existing
accounts created before account_admin_controls are intentionally treated as
active/pending until the ERP records an explicit decision.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
_CACHE_TTL_SECONDS = 2.0


def _cached(user_id: str):
    item = _CACHE.get(user_id)
    if not item:
        return False, None
    expires_at, value = item
    if expires_at <= time.monotonic():
        _CACHE.pop(user_id, None)
        return False, None
    return True, value


def _put(user_id: str, value: dict[str, Any] | None):
    if len(_CACHE) > 5000:
        now = time.monotonic()
        for key, (expires_at, _) in list(_CACHE.items())[:1000]:
            if expires_at <= now:
                _CACHE.pop(key, None)
    _CACHE[user_id] = (time.monotonic() + _CACHE_TTL_SECONDS, value)


def is_blocked(control: dict[str, Any] | None) -> tuple[bool, str | None]:
    if not control:
        return False, None
    if control.get("is_active") is False:
        return True, "account_disabled_by_admin"
    if str(control.get("admin_status") or "pending") == "invalidated":
        return True, "account_invalidated_by_admin"
    return False, None


def install_account_control_guard(app, main_module):
    @app.middleware("http")
    async def account_control_guard(request: Request, call_next):
        authorization = request.headers.get("authorization") or ""
        if not authorization.startswith("Bearer "):
            return await call_next(request)
        try:
            user = await main_module.current_user(authorization)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        if user.role not in {"client", "driver"}:
            return await call_next(request)

        found, control = _cached(user.id)
        if not found:
            response = main_module.db_retry(
                lambda: main_module.db()
                .table("account_admin_controls")
                .select("is_active,admin_status")
                .eq("user_id", user.id)
                .limit(1)
            )
            rows = response.data or []
            control = rows[0] if rows else None
            _put(user.id, control)

        blocked, reason = is_blocked(control)
        if blocked:
            return JSONResponse(status_code=403, content={"detail": reason})
        return await call_next(request)
