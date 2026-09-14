import asyncio
from pathlib import Path
from app import auth_proxy


def test_password_login_returns_fast_session(monkeypatch):
    calls = {}
    async def fake_post(path, payload):
        calls["path"] = path
        calls["payload"] = payload
        return {"access_token":"test-access","refresh_token":"test-refresh","expires_in":3600,"token_type":"bearer","user":{"id":"user-1"}}
    monkeypatch.setattr(auth_proxy, "_supabase_auth_post", fake_post)
    result = asyncio.run(auth_proxy.password_login(auth_proxy.PasswordLoginRequest(email="user@example.com", password="a-password")))
    assert calls["path"] == "/auth/v1/token?grant_type=password"
    assert result["access_token"] == "test-access"


def test_signup_returns_session_when_provider_creates_one(monkeypatch):
    async def fake_post(path, payload):
        assert path == "/auth/v1/signup"
        assert payload["data"]["role"] == "client"
        return {"access_token":"signup-access","refresh_token":"signup-refresh","expires_in":3600,"token_type":"bearer","user":{"id":"user-2"}}
    monkeypatch.setattr(auth_proxy, "_supabase_auth_post", fake_post)
    result = asyncio.run(auth_proxy.signup(auth_proxy.SignupRequest(email="new@example.com", password="password-1234", role="client", first_name="Test", last_name="FAST", phone="0600000000")))
    assert result["session"] is True
    assert result["access_token"] == "signup-access"


def test_android_auth_ui_routes_through_fast_backend():
    root = Path(__file__).resolve().parents[2]
    assets = root / "app/src/main/assets"
    source = "\n".join(p.read_text(encoding="utf-8") for p in sorted(assets.glob("*.js")))
    assert "/v1/auth/password" in source
    assert "/v1/auth/signup" in source
    assert "/v1/auth/recover" in source
    assert "/auth/v1/signup" not in source
