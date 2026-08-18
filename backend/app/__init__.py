"""FAST backend package bootstrap.

The package attaches lightweight auxiliary routers to the main FastAPI app while
keeping the production entrypoint unchanged (uvicorn app.main:app).
"""

from .auth_memory import router as auth_memory_router
from . import main as _main

_main.app.include_router(auth_memory_router)
