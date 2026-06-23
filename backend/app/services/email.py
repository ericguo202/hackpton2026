"""
Mailgun transactional email — one HTTP call, fire-and-forget.

A ~20-line httpx wrapper around Mailgun's `messages` endpoint, mirroring the
pattern in `tts.py` / `company_research.py` rather than carrying an SDK. Used by
two callers: incident logging (warning alerts) and the policy-change notifier.

Best-effort by contract: `send_email` NEVER raises. It returns `False` (and logs
a warning) when Mailgun is unconfigured or any HTTP/transport error occurs, so an
email failure can never break the caller — incident logging, request handling, or
app boot. Plain-text bodies are sufficient for both current use cases.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

MAILGUN_TIMEOUT_SECONDS = 10.0


def mailgun_configured() -> bool:
    """True only when both the API key and sending domain are set."""
    return bool(settings.MAILGUN_API_KEY and settings.MAILGUN_DOMAIN)


async def send_email(
    *,
    to: str,
    subject: str,
    text: str,
    from_addr: str | None = None,
) -> bool:
    """POST one message to Mailgun. Returns True on a 2xx, False otherwise.

    Never raises — missing config or any HTTP/transport error returns False so
    the (best-effort) caller is never disrupted. `from_addr` defaults to
    `settings.MAILGUN_FROM`.
    """
    if not mailgun_configured():
        logger.warning(
            "Mailgun not configured (MAILGUN_API_KEY/MAILGUN_DOMAIN); "
            "skipping email to %s (%r).",
            to,
            subject,
        )
        return False

    url = f"{settings.MAILGUN_BASE_URL.rstrip('/')}/{settings.MAILGUN_DOMAIN}/messages"
    data = {
        "from": from_addr or settings.MAILGUN_FROM,
        "to": to,
        "subject": subject,
        "text": text,
    }
    try:
        async with httpx.AsyncClient(timeout=MAILGUN_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                url,
                auth=("api", settings.MAILGUN_API_KEY or ""),
                data=data,
            )
            resp.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort, never propagate
        logger.warning("Mailgun send failed for %s (%r): %s", to, subject, exc)
        return False
