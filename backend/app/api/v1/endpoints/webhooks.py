"""
Clerk webhooks.

Clerk doesn't tell the browser when an account is deleted (the user clicks
"Delete account" inside `<UserButton />`, and the action goes straight from
the browser to Clerk's servers — our FastAPI never sees it). The webhook
closes that loop: Clerk POSTs `user.deleted` here, we delete the matching
`users` row, and the ON DELETE CASCADE FKs on `interview_sessions`,
`interview_configs`, `interview_turns`, and `session_metrics` clean up the
rest.

Auth model:
  This route is UNAUTHENTICATED at the FastAPI level — Clerk's server has
  no user JWT to send us. The signing secret IS the auth. Every request is
  verified via Svix's HMAC scheme (svix-id, svix-timestamp, svix-signature
  headers) using `CLERK_WEBHOOK_SECRET` before any DB work runs.

Idempotency:
  Svix retries non-2xx and timed-out deliveries for up to 24h with
  exponential backoff. The only side effect here is a DELETE on
  `clerk_user_id`, which is naturally idempotent — a retry after a
  successful delete is a harmless no-op (zero rows affected). We don't
  need to de-dupe on `svix-id` for that reason.
"""

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import delete
from svix.webhooks import Webhook, WebhookVerificationError

from app.core.config import settings
from app.db.models.user import User
from app.db.session import AsyncSessionLocal

router = APIRouter()


@router.post("/clerk", status_code=status.HTTP_204_NO_CONTENT)
async def clerk_webhook(request: Request) -> None:
    """Receive a verified Clerk webhook and apply it to the DB.

    Returns 204 on success (no body needed — Svix only cares about the
    2xx). Any 4xx/5xx triggers Svix's retry queue, so we reserve those
    for genuine errors and not "event we don't care about" — unknown
    event types are a successful 204.
    """
    if not settings.CLERK_WEBHOOK_SECRET:
        # Fail closed. If the secret isn't configured we can't verify
        # anything, and accepting an unverified delete would let any
        # caller wipe arbitrary users.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook secret not configured",
        )

    # Svix verifies against the RAW body — re-serializing the parsed JSON
    # would shuffle key order and break the HMAC. Read bytes, not .json().
    raw_body = await request.body()
    headers = dict(request.headers)

    try:
        payload = Webhook(settings.CLERK_WEBHOOK_SECRET).verify(raw_body, headers)
    except WebhookVerificationError:
        # Bad signature, missing svix-* headers, or timestamp outside the
        # replay window. Either an attacker or a misconfigured secret —
        # both look the same from here.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    event_type = payload.get("type")
    if event_type != "user.deleted":
        # Silently accept other events. We don't subscribe to them in the
        # Clerk dashboard, but if someone toggles them on later we don't
        # want Svix's retry queue piling up 4xxs.
        return None

    clerk_user_id = (payload.get("data") or {}).get("id")
    if not clerk_user_id:
        # Shape we didn't expect — verified-but-malformed. Log via 422 so
        # Svix surfaces it in the dashboard instead of silently dropping.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing data.id on user.deleted event",
        )

    # New session per webhook — the request-scoped `get_db` dep doesn't
    # apply here since we're not depending on it.
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.clerk_user_id == clerk_user_id))
        await db.commit()

    return None
