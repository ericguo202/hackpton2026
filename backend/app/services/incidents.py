"""Best-effort incident logging.

Incident logging is intentionally non-critical: failures here should never
change the user-facing behavior of auth, moderation, session creation, or error
handling.
"""

from __future__ import annotations

import logging
import traceback
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete as sa_delete, or_, update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models.incident import Incident
from app.db.models.user import User
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

MAX_SENT_CONTENT_CHARS = 10_000
MAX_ERROR_CHARS = 8_000
MAX_JSON_STRING_CHARS = 2_000

SEVERITY_INFO = "info"
SEVERITY_WARNING = "warning"
SEVERITY_ERROR = "error"

EVENT_USER_CREATED = "user_created"
EVENT_USER_SIGNED_IN = "user_signed_in"
EVENT_MODERATION_REQUEST = "moderation_request"
EVENT_INTERVIEW_SESSION_STARTED = "interview_session_started"
EVENT_SAVE_QUESTION = "save_question"
EVENT_INJECTION_DETECTED = "injection_detected"
EVENT_ERROR = "error"


def _clip(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    if len(value) <= limit:
        return value
    return value[: limit - 16] + "...[truncated]"


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _clip(value, MAX_JSON_STRING_CHARS)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Mapping):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_json_safe(v) for v in value]
    return _clip(repr(value), MAX_JSON_STRING_CHARS)


def _user_fields(user: User | None) -> dict[str, Any]:
    if user is None:
        return {"user_id": None, "clerk_user_id": None}
    return {"user_id": user.id, "clerk_user_id": user.clerk_user_id}


async def scrub_old_incident_content(
    db: AsyncSession, *, now: datetime | None = None, retention_days: int | None = None
) -> int:
    """NULL the free-text/JSON payload of incidents past the content-retention
    window, keeping the event skeleton (type/severity/timestamps) for audit.

    `sent_content`/`returned_content` can hold user-supplied text (moderated
    input, saved-question text, injection-attempt input), so we don't keep it
    indefinitely. Operates inside the CALLER's transaction (no commit) — the
    daily retention sweep batches this with its other work. Idempotent: rows
    already scrubbed are excluded, so re-runs report 0.
    """
    if retention_days is None:
        retention_days = settings.INCIDENT_CONTENT_RETENTION_DAYS
    # incidents.occurred_at is TIMESTAMP WITHOUT TIME ZONE (naive UTC) — compare
    # against a naive cutoff (see the same convention in delivery_consent.py).
    if now is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    elif now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(days=retention_days)

    result = await db.execute(
        sa_update(Incident)
        .where(Incident.occurred_at < cutoff)
        .where(
            or_(
                Incident.sent_content.isnot(None),
                Incident.returned_content.isnot(None),
                Incident.error.isnot(None),
            )
        )
        .values(sent_content=None, returned_content=None, error=None)
    )
    return result.rowcount or 0


async def delete_incidents_for_user(
    db: AsyncSession,
    *,
    user_id: UUID | None = None,
    clerk_user_id: str | None = None,
) -> int:
    """Hard-delete a departing user's incident rows.

    The `incidents.user_id` FK is ON DELETE SET NULL, so without this a deleted
    user's rows would survive de-linked but still carrying their content. Called
    from the Clerk `user.deleted` webhook BEFORE the users row is removed (so the
    `user_id` match still resolves). Matches on either identifier. Operates in
    the caller's transaction (no commit).
    """
    conditions = []
    if user_id is not None:
        conditions.append(Incident.user_id == user_id)
    if clerk_user_id is not None:
        conditions.append(Incident.clerk_user_id == clerk_user_id)
    if not conditions:
        return 0
    result = await db.execute(sa_delete(Incident).where(or_(*conditions)))
    return result.rowcount or 0


async def log_incident(
    *,
    event_type: str,
    severity: str = SEVERITY_INFO,
    user: User | None = None,
    user_id: UUID | None = None,
    clerk_user_id: str | None = None,
    session_id: UUID | None = None,
    idempotency_key: str | None = None,
    sent_content: str | None = None,
    returned_content: Any = None,
    error: str | None = None,
    metadata: Mapping[str, Any] | None = None,
    db: AsyncSession | None = None,
    commit: bool = True,
) -> None:
    """Insert one incident row, swallowing all failures.

    `db` and `commit` are accepted so call sites can pass request context
    naturally, but the write is isolated in its own short-lived session. That
    keeps a broken incident insert from aborting the caller's transaction.
    """
    fields = _user_fields(user)
    if user_id is not None:
        fields["user_id"] = user_id
    if clerk_user_id is not None:
        fields["clerk_user_id"] = clerk_user_id

    values = {
        "event_type": event_type,
        "severity": severity,
        **fields,
        "session_id": session_id,
        "idempotency_key": idempotency_key,
        "sent_content": _clip(sent_content, MAX_SENT_CONTENT_CHARS),
        "returned_content": _json_safe(returned_content),
        "error": _clip(error, MAX_ERROR_CHARS),
        "metadata": _json_safe(metadata or {}),
    }
    stmt = pg_insert(Incident.__table__).values(**values)
    if idempotency_key:
        stmt = stmt.on_conflict_do_nothing(index_elements=["idempotency_key"])

    try:
        async with AsyncSessionLocal() as owned_db:
            await owned_db.execute(stmt)
            await owned_db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Incident logging failed for %s: %s", event_type, exc)


async def log_user_created(
    db: AsyncSession,
    user: User,
    *,
    clerk_user_id: str,
) -> None:
    await log_incident(
        event_type=EVENT_USER_CREATED,
        severity=SEVERITY_INFO,
        user=user,
        clerk_user_id=clerk_user_id,
        idempotency_key=f"user_created:{clerk_user_id}",
        db=db,
    )


async def log_user_signed_in(
    db: AsyncSession,
    user: User,
    *,
    clerk_user_id: str,
    clerk_session_id: str,
) -> None:
    await log_incident(
        event_type=EVENT_USER_SIGNED_IN,
        severity=SEVERITY_INFO,
        user=user,
        clerk_user_id=clerk_user_id,
        idempotency_key=f"user_signed_in:{clerk_session_id}",
        metadata={"clerk_session_id": clerk_session_id},
        db=db,
    )


async def log_moderation_request(
    *,
    text: str,
    returned_content: Mapping[str, Any],
    user: User | None = None,
    db: AsyncSession | None = None,
    session_id: UUID | None = None,
    severity: str = SEVERITY_INFO,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    await log_incident(
        event_type=EVENT_MODERATION_REQUEST,
        severity=severity,
        user=user,
        session_id=session_id,
        sent_content=text,
        returned_content=returned_content,
        metadata=metadata,
        db=db,
    )


async def log_interview_session_started(
    db: AsyncSession,
    user: User,
    *,
    session_id: UUID,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    await log_incident(
        event_type=EVENT_INTERVIEW_SESSION_STARTED,
        severity=SEVERITY_INFO,
        user=user,
        session_id=session_id,
        metadata=metadata,
        db=db,
    )


async def log_save_question(
    db: AsyncSession,
    user: User,
    *,
    session_id: UUID,
    question_text: str,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    await log_incident(
        event_type=EVENT_SAVE_QUESTION,
        severity=SEVERITY_INFO,
        user=user,
        session_id=session_id,
        sent_content=question_text,
        metadata=metadata,
        db=db,
    )


async def log_injection_detected(
    *,
    source: str,
    text: str | None = None,
    user: User | None = None,
    session_id: UUID | None = None,
    db: AsyncSession | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    """Record a deterministic prompt-injection regex hit on user-supplied text.

    Logged as a WARNING: `CONTENT_INJECTION_RE` is high-precision (safe to
    hard-block on), so a hit is a strong signal of an intentional injection
    attempt rather than incidental prose. `source` names the gate that fired
    (e.g. ``"sessions.transcript"``, ``"sessions.company"``,
    ``"opening_question.profile"``); `text` is the offending input (clipped by
    `log_incident`). Best-effort like all incident logging — never raises.
    """
    meta = {"source": source}
    if metadata:
        meta.update(metadata)
    await log_incident(
        event_type=EVENT_INJECTION_DETECTED,
        severity=SEVERITY_WARNING,
        user=user,
        session_id=session_id,
        sent_content=text,
        metadata=meta,
        db=db,
    )


async def log_error(
    exc: BaseException,
    *,
    user: User | None = None,
    user_id: UUID | None = None,
    clerk_user_id: str | None = None,
    db: AsyncSession | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    err = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    await log_incident(
        event_type=EVENT_ERROR,
        severity=SEVERITY_ERROR,
        user=user,
        user_id=user_id,
        clerk_user_id=clerk_user_id,
        error=err,
        metadata=metadata,
        db=db,
    )
