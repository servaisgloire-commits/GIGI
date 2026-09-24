from pathlib import Path
import json


ROOT = Path(__file__).resolve().parents[2]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def test_shared_http_pool_replaces_per_request_clients():
    pool = read("backend/app/http_pool.py")
    main = read("backend/app/main.py")
    auth_proxy = read("backend/app/auth_proxy.py")
    auth_memory = read("backend/app/auth_memory.py")
    global_main = read("backend/app/global_main.py")

    assert "max_keepalive_connections=60" in pool
    assert "keepalive_expiry=45.0" in pool
    assert "shared_http_client()" in main
    assert "shared_http_client()" in auth_proxy
    assert "shared_http_client()" in auth_memory
    assert "shared_http_client()" in global_main

    for source in (main, auth_proxy, auth_memory, global_main):
        assert "httpx.AsyncClient(" not in source


def test_public_stable_endpoints_use_vercel_edge_cache():
    health = read("backend/app/vehicle_main.py")
    config = read("backend/app/flex_main.py")

    assert 'Vercel-CDN-Cache-Control' in health
    assert 's-maxage=10' in health
    assert 'Vercel-CDN-Cache-Control' in config
    assert 's-maxage=30' in config


def test_vercel_fluid_and_region_are_capacity_aligned():
    config = json.loads(read("backend/vercel.json"))
    assert config["fluid"] is True
    assert config["regions"] == ["dub1"]


def test_capacity_indexes_are_declared():
    migration = read("supabase/migrations/20260924_fast_capacity_indexes.sql")
    assert "fast_communication_messages_reply_to_idx" in migration
    assert "fast_communication_messages_sender_user_idx" in migration
    assert "fast_communication_threads_user_idx" in migration
