import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .main import SUPABASE_URL

router = APIRouter(prefix="/v1/auth", tags=["auth-proxy"])

SUPABASE_PUBLISHABLE_KEY = os.getenv(
    "SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38",
).strip()


class PasswordLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=1024)
    role: str = "client"
    first_name: str = ""
    last_name: str = ""
    phone: str = ""


class RecoverRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


async def _supabase_auth_post(path: str, payload: dict):
    if not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(503, "FAST authentication is not configured")

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(
                f"{SUPABASE_URL.rstrip('/')}{path}",
                headers={
                    "apikey": SUPABASE_PUBLISHABLE_KEY,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "FAST authentication service temporarily unavailable") from exc

    try:
        data = response.json()
    except Exception:
        data = {}

    if response.is_error:
        detail = (
            data.get("error_description")
            or data.get("msg")
            or data.get("message")
            or data.get("error")
            or "Authentication failed"
        )
        status = 401 if response.status_code in {400, 401} and "credential" in str(detail).lower() else response.status_code
        raise HTTPException(status if 400 <= status < 500 else 503, str(detail)[:220])

    return data


@router.post("/password")
async def password_login(body: PasswordLoginRequest):
    data = await _supabase_auth_post(
        "/auth/v1/token?grant_type=password",
        {"email": body.email.strip(), "password": body.password},
    )
    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(502, "FAST authentication response is incomplete")
    return {
        "access_token": access_token,
        "refresh_token": data.get("refresh_token"),
        "expires_in": data.get("expires_in"),
        "token_type": data.get("token_type") or "bearer",
        "user": data.get("user"),
    }


@router.post("/signup")
async def signup(body: SignupRequest):
    role = "driver" if body.role == "driver" else "client"
    data = await _supabase_auth_post(
        "/auth/v1/signup",
        {
            "email": body.email.strip(),
            "password": body.password,
            "data": {
                "role": role,
                "first_name": body.first_name.strip(),
                "last_name": body.last_name.strip(),
                "phone": body.phone.strip(),
            },
        },
    )
    return {
        "ok": True,
        "user": data.get("user"),
        "session": bool(data.get("access_token")),
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_in": data.get("expires_in"),
        "token_type": data.get("token_type") or "bearer" if data.get("access_token") else None,
    }


@router.post("/recover")
async def recover(body: RecoverRequest):
    await _supabase_auth_post(
        "/auth/v1/recover",
        {"email": body.email.strip()},
    )
    return {"ok": True}
