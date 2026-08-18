import hashlib
import math
import os
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hmwxwzfcpdvgzjgxruup.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
AUTH_EMAIL_COOLDOWN_SECONDS = max(60, int(os.getenv("AUTH_EMAIL_COOLDOWN_SECONDS", "120")))
AUTH_EMAIL_LIMIT_BACKOFF_SECONDS = max(300, int(os.getenv("AUTH_EMAIL_LIMIT_BACKOFF_SECONDS", "600")))
RESET_REDIRECT_URL = f"{SUPABASE_URL}/functions/v1/fast-reset-password"

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class EmailRequest(BaseModel):
    email: str


def _db():
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Service d’authentification momentanément indisponible")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _normalize_email(value: str) -> str:
    email = str(value or "").strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(400, "Adresse e-mail invalide")
    return email


def _email_hash(email: str, purpose: str) -> str:
    return hashlib.sha256(f"{purpose}:{email}".encode("utf-8")).hexdigest()


def _parse_time(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _seconds_until(dt, now):
    if not dt:
        return 0
    return max(0, math.ceil((dt - now).total_seconds()))


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if forwarded:
        return forwarded
    return request.client.host if request.client else "0.0.0.0"


def _memory(client, key: str):
    rows = (
        client.table("auth_email_memory")
        .select("email_hash,last_sent_at,blocked_until,attempts,last_status,updated_at")
        .eq("email_hash", key)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _remember(client, key: str, attempts: int, status: str, blocked_until, last_sent_at=None):
    payload = {
        "email_hash": key,
        "blocked_until": blocked_until.isoformat() if blocked_until else None,
        "attempts": attempts,
        "last_status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if last_sent_at:
        payload["last_sent_at"] = last_sent_at.isoformat()
    client.table("auth_email_memory").upsert(payload, on_conflict="email_hash").execute()


async def _auth_email_request(*, request: Request, email: str, purpose: str, path: str, payload: dict, success_message: str):
    email = _normalize_email(email)
    key = _email_hash(email, purpose)
    now = datetime.now(timezone.utc)
    client = _db()
    memory = _memory(client, key)
    blocked_until = _parse_time(memory.get("blocked_until")) if memory else None
    retry_after = _seconds_until(blocked_until, now)
    if retry_after > 0:
        return {
            "ok": False,
            "status": "cooldown",
            "retry_after_seconds": retry_after,
            "message": "Une demande a déjà été envoyée. Patientez un moment puis vérifiez votre boîte de réception et vos spams.",
        }

    attempts = int((memory or {}).get("attempts") or 0) + 1
    _remember(client, key, attempts, "sending", now + timedelta(seconds=AUTH_EMAIL_COOLDOWN_SECONDS))

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Sb-Forwarded-For": _client_ip(request),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            response = await http.post(f"{SUPABASE_URL}{path}", headers=headers, json=payload)
    except Exception:
        _remember(client, key, attempts, "network_error", now + timedelta(seconds=60))
        raise HTTPException(503, "L’envoi de l’e-mail est momentanément indisponible. Réessayez dans une minute.")

    response_payload = {}
    try:
        response_payload = response.json()
    except Exception:
        pass

    raw_message = str(
        response_payload.get("msg")
        or response_payload.get("message")
        or response_payload.get("error_description")
        or ""
    )
    is_rate_limited = response.status_code == 429 or "rate limit" in raw_message.lower() or "security purposes" in raw_message.lower()
    if is_rate_limited:
        _remember(client, key, attempts, "provider_rate_limited", now + timedelta(seconds=AUTH_EMAIL_LIMIT_BACKOFF_SECONDS))
        return {
            "ok": False,
            "status": "rate_limited",
            "retry_after_seconds": AUTH_EMAIL_LIMIT_BACKOFF_SECONDS,
            "message": "Un e-mail a déjà été demandé récemment. Patientez quelques minutes avant un nouvel essai.",
        }

    if response.status_code >= 400:
        _remember(client, key, attempts, "provider_error", now + timedelta(seconds=60))
        raise HTTPException(502, "Impossible d’envoyer l’e-mail pour le moment. Réessayez dans une minute.")

    sent_at = datetime.now(timezone.utc)
    _remember(
        client,
        key,
        attempts,
        "sent",
        sent_at + timedelta(seconds=AUTH_EMAIL_COOLDOWN_SECONDS),
        last_sent_at=sent_at,
    )
    return {
        "ok": True,
        "status": "sent",
        "retry_after_seconds": AUTH_EMAIL_COOLDOWN_SECONDS,
        "message": success_message,
    }


@router.post("/resend-confirmation")
async def resend_confirmation(body: EmailRequest, request: Request):
    return await _auth_email_request(
        request=request,
        email=body.email,
        purpose="signup",
        path="/auth/v1/resend",
        payload={"type": "signup", "email": _normalize_email(body.email)},
        success_message="E-mail de confirmation envoyé. Vérifiez votre boîte de réception et vos spams.",
    )


@router.post("/recover-password")
async def recover_password(body: EmailRequest, request: Request):
    email = _normalize_email(body.email)
    return await _auth_email_request(
        request=request,
        email=email,
        purpose="recovery",
        path="/auth/v1/recover",
        payload={"email": email, "redirect_to": RESET_REDIRECT_URL},
        success_message="E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception et vos spams.",
    )
