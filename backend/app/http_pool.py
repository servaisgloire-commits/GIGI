import asyncio
from typing import Optional

import httpx


_client: Optional[httpx.AsyncClient] = None
_client_loop_id: Optional[int] = None


def shared_http_client() -> httpx.AsyncClient:
    """Reuse outbound HTTP connections inside one warm Vercel function instance.

    Vercel Fluid Compute can keep a Python instance warm across concurrent requests.
    A shared client avoids creating a fresh TCP/TLS connection for every call to
    Supabase Auth, Google Maps/Places and OSRM.
    """
    global _client, _client_loop_id

    loop = asyncio.get_running_loop()
    loop_id = id(loop)
    if _client is None or _client.is_closed or _client_loop_id != loop_id:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=4.0, read=12.0, write=12.0, pool=4.0),
            limits=httpx.Limits(
                max_connections=120,
                max_keepalive_connections=60,
                keepalive_expiry=45.0,
            ),
            transport=httpx.AsyncHTTPTransport(retries=1),
            headers={
                "User-Agent": "FAST-N1/6.0",
                "Accept": "application/json",
            },
        )
        _client_loop_id = loop_id
    return _client
