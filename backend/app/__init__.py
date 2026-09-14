"""FAST backend package bootstrap.

The package attaches lightweight auxiliary routers and administrative guards to
the main FastAPI app while keeping the production entrypoint unchanged.
"""

from .auth_memory import router as auth_memory_router
from .auth_proxy import router as auth_proxy_router
from . import main as _main
from .account_control_guard import install_account_control_guard

# Keep the existing CORS policy exactly as configured in main.py and only add
# the PUT method required by the driver's vehicle-save endpoint. Without this,
# Android WebView preflight requests are rejected with HTTP 400 before the PUT
# can reach /v1/driver/vehicle, which surfaces to the app as "Failed to fetch".
for middleware in _main.app.user_middleware:
    if getattr(middleware, "cls", None).__name__ == "CORSMiddleware":
        methods = list(middleware.kwargs.get("allow_methods", []))
        if "PUT" not in methods:
            middleware.kwargs["allow_methods"] = [*methods, "PUT"]
        break

_main.app.include_router(auth_memory_router)
_main.app.include_router(auth_proxy_router)
install_account_control_guard(_main.app, _main)
