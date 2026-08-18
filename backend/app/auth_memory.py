import hashlib
import math
import os
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hmwxwzfcpdvgzjgxruup.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
AUTH_EMAIL_COOLDOWN_SECONDS = max(60, int(os.getenv("AUTH_EMAIL_COOLDOWN_SECONDS", "120")))
AUTH_EMAIL_LIMIT_BACKOFF_SECONDS = max(300, int(os.getenv("AUTH_EMAIL_LIMIT_BACKOFF_SECONDS", "600")))

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class ResendConfirmationRequest(BaseModel):
    email: EmailStr


def _db():
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Service d’authentification momentanément indisponible")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _email_hash(email: str) -> str:
    normalized = email.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


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


@router.post("/resend-confirmation")
async def resend_confirmation(body: ResendConfirmationRequest):
    """Resend signup confirmation with persistent server-side cooldown memory.

    The database row is keyed by SHA-256(email), so the raw email address is not
    persisted.  The cooldown is written before calling Supabase Auth to prevent
    repeated taps and concurrent requests from exhausting the provider quota.
    """
    email = str(body.email).strip().lower()
    key = _email_hash(email)
    now = datetime.now(timezone.utc)
    client = _db()

    rows = (
        client.table("auth_email_memory")
        .select("email_hash,last_sent_at,blocked_until,attempts,last_status,updated_at")
        .eq("email_hash", key)
        .limit(1)
        .execute()
        .data
        or []
    )
    memory = rows[0] if rows else None
    blocked_until = _parse_time(memory.get("blocked_until")) if memory else None
    retry_after = _seconds_until(blocked_until, now)
    if retry_after > 0:
        return {
            "ok": False,
            "status": "cooldown",
            "retry_after_seconds": retry_after,
            "message": "Un e-mail a déjà été demandé. Patientez un moment puis vérifiez votre boîte de réception et vos spams.",
        }

    attempts = int((memory or {}).get("attempts") or 0) + 1
    reservation_until = now + timedelta(seconds=AUTH_EMAIL_COOLDOWN_SECONDS)
    client.table("auth_email_memory").upsert(
        {
            "email_hash": key,
            "blocked_until": reservation_until.isoformat(),
            "attempts": attempts,
            "last_status": "sending",
            "updated_at": now.isoformat(),
        },
        on_conflict="email_hash",
    ).execute()

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            response = await http.post(
                f"{SUPABASE_URL}/auth/v1/resend",
                headers=headers,
                json={"type": "signup", "email": email},
            )
    except Exception:
        client.table("auth_email_memory").upsert(
            {
                "email_hash": key,
                "blocked_until": (now + timedelta(seconds=60)).isoformat(),
                "attempts": attempts,
                "last_status": "network_error",
                "updated_at": now.isoformat(),
            },
            on_conflict="email_hash",
        ).execute()
        raise HTTPException(503, "L’envoi de l’e-mail est momentanément indisponible. Réessayez dans une minute.")

    payload = {}
    try:
        payload = response.json()
    except Exception:
        pass

    raw_message = str(payload.get("msg") or payload.get("message") or payload.get("error_description") or "")
    is_rate_limited = response.status_code == 429 or "rate limit" in raw_message.lower()
    if is_rate_limited:
        blocked = now + timedelta(seconds=AUTH_EMAIL_LIMIT_BACKOFF_SECONDS)
        client.table("auth_email_memory").upsert(
            {
                "email_hash": key,
                "blocked_until": blocked.isoformat(),
                "attempts": attempts,
                "last_status": "provider_rate_limited",
                "updated_at": now.isoformat(),
            },
            on_conflict="email_hash",
        ).execute()
        return {
            "ok": False,
            "status": "rate_limited",
            "retry_after_seconds": AUTH_EMAIL_LIMIT_BACKOFF_SECONDS,
            "message": "Le service d’e-mail est très sollicité. Votre demande est mémorisée ; patientez quelques minutes avant un nouvel essai.",
        }

    if response.status_code >= 400:
        client.table("auth_email_memory").upsert(
            {
                "email_hash": key,
                "blocked_until": (now + timedelta(seconds=60)).isoformat(),
                "attempts": attempts,
                "last_status": "provider_error",
                "updated_at": now.isoformat(),
            },
            on_conflict="email_hash",
        ).execute()
        raise HTTPException(502, "Impossible d’envoyer l’e-mail pour le moment. Réessayez dans une minute.")

    sent_at = datetime.now(timezone.utc)
    client.table("auth_email_memory").upsert(
        {
            "email_hash": key,
            "last_sent_at": sent_at.isoformat(),
            "blocked_until": (sent_at + timedelta(seconds=AUTH_EMAIL_COOLDOWN_SECONDS)).isoformat(),
            "attempts": attempts,
            "last_status": "sent",
            "updated_at": sent_at.isoformat(),
        },
        on_conflict="email_hash",
    ).execute()
    return {
        "ok": True,
        "status": "sent",
        "retry_after_seconds": AUTH_EMAIL_COOLDOWN_SECONDS,
        "message": "E-mail de confirmation envoyé. Vérifiez votre boîte de réception et vos spams.",
    }
