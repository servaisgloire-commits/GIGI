"""FAST backend package bootstrap.

The package attaches lightweight auxiliary routers and administrative guards to
the main FastAPI app while keeping the production entrypoint unchanged.
"""

from .auth_memory import router as auth_memory_router
from . import main as _main
from .account_control_guard import install_account_control_guard

_main.app.include_router(auth_memory_router)
install_account_control_guard(_main.app, _main)
