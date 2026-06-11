"""Consent + retention helpers for server-stored webcam delivery analytics.

The browser may compute MediaPipe-based delivery summaries during practice.
Raw video frames and landmarks stay client-side, but the numeric per-turn
summary (`interview_turns.cv_summary`) is stored server-side, so consent for
that artifact must be demonstrable on the user row.

Retention: the delivery-analytics consent promises these summaries are kept no
longer than `DELIVERY_ANALYTICS_RETENTION_MONTHS` after the user's last practice
session. 12 months is the strictest common ceiling across the biometric regimes
we surveyed (Texas CUBI ~1yr after purpose; Colorado HB24-1130 24mo; Illinois
BIPA §15(a) 3yr) — chosen deliberately since the data is non-identifying
coaching metrics. `purge_expired_delivery_analytics` enforces that promise; the
in-app scheduler (`delivery_retention_scheduler.py`) runs it on a daily cadence.
The same purge primitive backs the user-initiated revocation in `me.py`.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.session_metrics import SessionMetrics
from app.db.models.user import User


DELIVERY_ANALYTICS_NOTICE_VERSION = 1

# Hard retention ceiling for server-stored delivery summaries, anchored to the
# user's most recent session. Mirrors the user-facing consent copy ("never
# longer than 12 months after your last practice session"). Measured in days so
# the cutoff is unambiguous; 365 days lands at or before the 12-month mark,
# which only ever deletes sooner — consistent with the "no later than" promise.
DELIVERY_ANALYTICS_RETENTION_MONTHS = 12
_RETENTION_DELTA = timedelta(days=365)


def has_active_delivery_analytics_consent(user: User) -> bool:
    """Return True only for the current, non-revoked notice version."""
    if user.delivery_analytics_consent_at is None:
        return False
    if user.delivery_analytics_consent_version != DELIVERY_ANALYTICS_NOTICE_VERSION:
        return False
    revoked_at = user.delivery_analytics_revoked_at
    return revoked_at is None or revoked_at < user.delivery_analytics_consent_at


def strip_delivery_feedback(feedback_detail: dict | None) -> dict | None:
    """Remove server-derived delivery coaching from a structured feedback blob."""
    if not isinstance(feedback_detail, dict):
        return feedback_detail

    next_detail = dict(feedback_detail)
    next_detail.pop("delivery_feedback", None)

    quick_wins = next_detail.get("quick_wins")
    if isinstance(quick_wins, list):
        next_detail["quick_wins"] = [
            item for item in quick_wins
            if not (
                isinstance(item, str)
                and item.strip().lower().startswith("delivery:")
            )
        ]

    return next_detail


def recompute_session_without_delivery(
    session: InterviewSession,
    metrics: SessionMetrics | None,
    turns: list[InterviewTurn],
) -> None:
    """Refresh cached aggregates after deleting facial-delivery artifacts."""
    flat_scores: list[float] = []
    for turn in turns:
        if turn.transcript_text is None:
            continue
        for value in (
            turn.structure_score,
            turn.problem_solving_score,
            turn.impact_score,
            turn.initiative_score,
            turn.depth_score,
        ):
            if value is not None:
                flat_scores.append(float(value))

    overall = (
        min(99.99, round(sum(flat_scores) / len(flat_scores) * 10, 2))
        if flat_scores
        else None
    )
    session.overall_score = overall
    if metrics is not None:
        metrics.avg_delivery = None
        metrics.overall_score = overall


async def purge_delivery_analytics_for_user(db: AsyncSession, user_id: UUID) -> None:
    """Null out stored webcam-derived summaries + derived delivery outputs.

    Idempotent: re-running on an already-purged user is a no-op. Does NOT
    commit — the caller owns the transaction boundary.
    """
    rows = await db.execute(
        select(InterviewSession, InterviewTurn, SessionMetrics)
        .join(InterviewTurn, InterviewTurn.session_id == InterviewSession.id)
        .outerjoin(
            SessionMetrics,
            SessionMetrics.session_id == InterviewSession.id,
        )
        .where(InterviewSession.user_id == user_id)
        .order_by(InterviewSession.id, InterviewTurn.turn_number)
    )

    turns_by_session: dict[InterviewSession, list[InterviewTurn]] = {}
    metrics_by_session: dict[InterviewSession, SessionMetrics | None] = {}
    for session, turn, metrics in rows.all():
        turns_by_session.setdefault(session, []).append(turn)
        metrics_by_session[session] = metrics
        turn.cv_summary = None
        turn.delivery_score = None
        turn.feedback_detail = strip_delivery_feedback(turn.feedback_detail)

    for session, turns in turns_by_session.items():
        recompute_session_without_delivery(
            session,
            metrics_by_session.get(session),
            turns,
        )


async def purge_expired_delivery_analytics(
    db: AsyncSession, *, now: datetime | None = None
) -> int:
    """Purge delivery analytics for users past the retention ceiling.

    "Past the ceiling" = the user's most recent session ended/started more than
    `DELIVERY_ANALYTICS_RETENTION_MONTHS` ago. The clock resets on every new
    session, matching the consent copy and the "last interaction" standard
    common to the biometric statutes.

    Returns the number of users purged. Does NOT commit — the caller owns the
    transaction boundary (the scheduler wraps this in a single transaction with
    an advisory lock; tests can inspect before committing).
    """
    # The session timestamp columns are TIMESTAMP WITHOUT TIME ZONE (naive UTC),
    # so the cutoff must be naive UTC too — Postgres/asyncpg refuse to compare
    # naive and aware values. Normalize whatever the caller passes.
    if now is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    elif now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    cutoff = now - _RETENTION_DELTA

    # Per-user recency. ended_at is NULL for abandoned sessions, so fall back to
    # started_at then created_at; max() across the user's sessions is their last
    # interaction.
    last_activity = func.max(
        func.coalesce(
            InterviewSession.ended_at,
            InterviewSession.started_at,
            InterviewSession.created_at,
        )
    )
    stale_user_ids = (
        await db.execute(
            select(InterviewSession.user_id)
            .group_by(InterviewSession.user_id)
            .having(last_activity < cutoff)
        )
    ).scalars().all()

    purged = 0
    for user_id in stale_user_ids:
        # Skip users with nothing left to purge so the count reflects real work
        # (and re-runs after a purge report 0).
        has_analytics = await db.scalar(
            select(InterviewTurn.id)
            .join(
                InterviewSession,
                InterviewTurn.session_id == InterviewSession.id,
            )
            .where(InterviewSession.user_id == user_id)
            .where(
                or_(
                    InterviewTurn.cv_summary.isnot(None),
                    InterviewTurn.delivery_score.isnot(None),
                )
            )
            .limit(1)
        )
        if has_analytics is None:
            continue
        await purge_delivery_analytics_for_user(db, user_id)
        purged += 1

    return purged
