import asyncio
from pathlib import Path

from app import auth_proxy


def test_password_login_returns_fast_session(monkeypatch):
    calls = {}

    async def fake_post(path, payload):
        calls["path"] = path
        calls["payload"] = payload
        return {
            "access_token": "test-access",
            "refresh_token": "test-refresh",
            "expires_in": 3600,
            "token_type": "bearer",
            "user": {"id": "user-1"},
        }

    monkeypatch.setattr(auth_proxy, "_supabase_auth_post", fake_post)
    result = asyncio.run(
        auth_proxy.password_login(
            auth_proxy.PasswordLoginRequest(email="user@example.com", password="a-password")
        )
    )

    assert calls["path"] == "/auth/v1/token?grant_type=password"
    assert calls["payload"]["email"] == "user@example.com"
    assert result["access_token"] == "test-access"


def test_signup_returns_session_when_provider_creates_one(monkeypatch):
    async def fake_post(path, payload):
        assert path == "/auth/v1/signup"
        assert payload["data"]["role"] == "client"
        return {
            "access_token": "signup-access",
            "refresh_token": "signup-refresh",
            "expires_in": 3600,
            "token_type": "bearer",
            "user": {"id": "user-2"},
        }

    monkeypatch.setattr(auth_proxy, "_supabase_auth_post", fake_post)
    result = asyncio.run(
        auth_proxy.signup(
            auth_proxy.SignupRequest(
                email="new@example.com",
                password="password-1234",
                role="client",
                first_name="Test",
                last_name="FAST",
                phone="0600000000",
            )
        )
    )

    assert result["session"] is True
    assert result["access_token"] == "signup-access"


def test_android_auth_ui_routes_through_fast_backend():
    root = Path(__file__).resolve().parents[2]
    proxy_js = (root / "app/src/main/assets/auth-proxy-fix.js").read_text(encoding="utf-8")
    signup_js = (root / "app/src/main/assets/signup-ui-cleanup.js").read_text(encoding="utf-8")
    index_html = (root / "app/src/main/assets/index.html").read_text(encoding="utf-8")

    assert "/v1/auth/password" in proxy_js
    assert "/v1/auth/signup" in proxy_js
    assert "/v1/auth/recover-password" in proxy_js
    assert "supa('/auth/v1/signup'" not in signup_js
    assert "auth-proxy-fix.js" in index_html
    assert index_html.index("app.js") < index_html.index("auth-proxy-fix.js") < index_html.index("stability-fixes.js")
