"""
/me endpoints — caller identity probe + rolling user-level aggregates.

`get_current_user_db` both verifies the Clerk JWT and ensures a `users` row
exists for the caller (upsert on first call). Every handler here runs only
for authenticated users.

Routes:
  GET /api/v1/me        — full DB row for the caller (auth smoke test)
  GET /api/v1/me/stats  — aggregate scores across all completed sessions

Expected behaviors for /me:
  - no Authorization header            -> 401 "Missing bearer token"
  - Authorization: Bearer <garbage>    -> 401 "Invalid token: ..."
  - Authorization: Bearer <valid JWT>  -> 200 UserOut
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import Integer, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims, current_user, get_current_user_db
from app.db.models.enums import SessionStatus, UserTier
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.saved_question import SavedQuestion
from app.db.models.session_metrics import SessionMetrics
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session import DimensionAverages, FillerWordStat, MeStatsOut
from app.schemas.user import (
    DeliveryAnalyticsConsentIn,
    PolicyAcceptanceIn,
    UserOut,
)
from app.services.daily_limit import check_and_reset as daily_check_and_reset
from app.services.delivery_consent import (
    DELIVERY_ANALYTICS_NOTICE_VERSION,
    purge_delivery_analytics_for_user,
)
from app.services.policy_versions import (
    CURRENT_PRIVACY_VERSION,
    CURRENT_TERMS_VERSION,
)
from app.services.filler_words import filler_rate_pct

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.get("", response_model=UserOut)
async def get_me(
    claims: ClerkClaims = Depends(current_user),
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Roll over the free-tier daily counter at view time so Home's "X/5
    # sessions today" reflects the user's local-calendar today, not the
    # day they last started a session. Without this, a user who hit the
    # cap last night sees a stale "5/5" the next morning even though the
    # gate at POST /sessions would let them through. `check_and_reset`
    # refreshes the attached ORM instance, so the value below is current.
    if user.tier == UserTier.free:
        await daily_check_and_reset(db, user)

    # Duplicate-email detection BEFORE onboarding. A users row's `email` is
    # written (and its UNIQUE constraint checked) only at the onboarding
    # commit, so a collision with an orphaned row — e.g. a deleted Clerk
    # account whose `user.deleted` webhook never landed — otherwise surfaces
    # as a 409 only after the user fills out the whole form. We detect it up
    # front using the caller's email from the session-token custom claim
    # (`claims.email`). Only meaningful pre-onboarding (own row has email NULL,
    # so no self-match); skip once onboarded. Fails open when the claim isn't
    # configured (`claims.email is None`) — behavior reverts to the late 409.
    if not user.completed_registration and claims.email:
        conflicting_id = await db.scalar(
            select(User.id).where(
                User.email == claims.email,
                User.clerk_user_id != claims.sub,
            )
        )
        # Transient attribute read back by UserOut's from_attributes.
        user.email_conflict = conflicting_id is not None

    return user


@router.put("/delivery-analytics-consent", response_model=UserOut)
async def accept_delivery_analytics_consent(
    body: DeliveryAnalyticsConsentIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Persist affirmative consent for server-stored delivery analytics."""
    if not body.accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Consent must be accepted to enable delivery analytics.",
        )
    if body.notice_version != DELIVERY_ANALYTICS_NOTICE_VERSION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Delivery analytics notice version is out of date.",
        )

    user.delivery_analytics_consent_at = _utcnow()
    user.delivery_analytics_consent_version = DELIVERY_ANALYTICS_NOTICE_VERSION
    user.delivery_analytics_revoked_at = None
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/delivery-analytics-consent", response_model=UserOut)
async def revoke_delivery_analytics_consent(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Revoke future collection and delete stored delivery analytics history."""
    user.delivery_analytics_revoked_at = _utcnow()
    await purge_delivery_analytics_for_user(db, user.id)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/policy-acceptance", response_model=UserOut)
async def accept_policies(
    body: PolicyAcceptanceIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Record affirmative acceptance of the current Terms of Service + Privacy Policy.

    The per-version timestamp written here is the clickwrap record ("who accepted
    which version when") that makes the posted terms enforceable. Bumping a
    CURRENT_* version invalidates the old record and the frontend gate re-prompts.
    """
    if not body.accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You must accept the Terms of Service and Privacy Policy to continue.",
        )
    if (
        body.terms_version != CURRENT_TERMS_VERSION
        or body.privacy_version != CURRENT_PRIVACY_VERSION
    ):
        # A stale tab tried to record an old version. Reject so the record always
        # reflects the version actually presented to the user.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Policy version is out of date. Reload and review the latest terms.",
        )

    now = _utcnow()
    user.terms_accepted_version = CURRENT_TERMS_VERSION
    user.terms_accepted_at = now
    user.privacy_accepted_version = CURRENT_PRIVACY_VERSION
    user.privacy_accepted_at = now
    await db.commit()
    await db.refresh(user)
    return user


def _columns(obj, fields: tuple[str, ...]) -> dict:
    """Pull a fixed allowlist of column values off an ORM row into a dict.

    Explicit allowlist (not __dict__) so a new internal column never silently
    leaks into the user-facing export.
    """
    return {f: getattr(obj, f) for f in fields}


_EXPORT_USER_FIELDS = (
    "id", "email", "name", "resume_text", "industry", "target_role",
    "experience_level", "short_bio", "timezone", "tier",
    "delivery_analytics_consent_at", "delivery_analytics_consent_version",
    "delivery_analytics_revoked_at",
    "terms_accepted_version", "terms_accepted_at",
    "privacy_accepted_version", "privacy_accepted_at",
    "created_at", "updated_at",
)
_EXPORT_SESSION_FIELDS = (
    "id", "company", "job_title", "company_summary", "status", "overall_score",
    "experience_level", "saved_question_id", "started_at", "ended_at",
    "created_at",
)
_EXPORT_TURN_FIELDS = (
    "id", "session_id", "turn_number", "question_text", "transcript_text",
    "is_followup", "structure_score", "problem_solving_score", "impact_score",
    "initiative_score", "depth_score", "delivery_score", "cv_summary",
    "filler_word_count", "filler_word_breakdown", "word_count", "feedback",
    "feedback_detail", "ai_model_used", "evaluated_at", "created_at",
)
_EXPORT_METRICS_FIELDS = (
    "avg_structure", "avg_problem_solving", "avg_initiative", "avg_impact",
    "avg_depth", "avg_delivery", "total_filler_word_count", "total_word_count",
    "overall_score", "turns_evaluated", "generated_at",
)
_EXPORT_SAVED_QUESTION_FIELDS = (
    "id", "question_text", "company", "job_title", "category",
    "experience_level", "created_at",
)


@router.get("/export")
async def export_my_data(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Export everything we store about the caller as one JSON bundle.

    Backs the access / data-portability rights (GDPR Art. 15/20, CCPA right to
    know, etc.). Includes the consent record, all sessions + turns (transcripts,
    scores, webcam `cv_summary`, feedback), session metrics, and saved
    questions. Internal audit data (the `incidents` log) is deliberately
    excluded — it's operational/security data, not the subject's content.
    """
    sessions = (
        await db.execute(
            select(InterviewSession)
            .where(InterviewSession.user_id == user.id)
            .order_by(InterviewSession.created_at)
        )
    ).scalars().all()
    session_ids = [s.id for s in sessions]

    turns_by_session: dict = {}
    metrics_by_session: dict = {}
    if session_ids:
        turns = (
            await db.execute(
                select(InterviewTurn)
                .where(InterviewTurn.session_id.in_(session_ids))
                .order_by(InterviewTurn.session_id, InterviewTurn.turn_number)
            )
        ).scalars().all()
        for turn in turns:
            turns_by_session.setdefault(turn.session_id, []).append(
                _columns(turn, _EXPORT_TURN_FIELDS)
            )
        metrics_rows = (
            await db.execute(
                select(SessionMetrics).where(
                    SessionMetrics.session_id.in_(session_ids)
                )
            )
        ).scalars().all()
        for m in metrics_rows:
            metrics_by_session[m.session_id] = _columns(m, _EXPORT_METRICS_FIELDS)

    saved = (
        await db.execute(
            select(SavedQuestion)
            .where(SavedQuestion.user_id == user.id)
            .order_by(SavedQuestion.created_at)
        )
    ).scalars().all()

    bundle = {
        "exported_at": _utcnow().isoformat(),
        "user": _columns(user, _EXPORT_USER_FIELDS),
        "sessions": [
            {
                **_columns(s, _EXPORT_SESSION_FIELDS),
                "metrics": metrics_by_session.get(s.id),
                "turns": turns_by_session.get(s.id, []),
            }
            for s in sessions
        ],
        "saved_questions": [
            _columns(q, _EXPORT_SAVED_QUESTION_FIELDS) for q in saved
        ],
    }
    return JSONResponse(
        content=jsonable_encoder(bundle),
        headers={
            "Content-Disposition": 'attachment; filename="my-data-export.json"'
        },
    )


def _to_decimal(v) -> Decimal | None:
    """Normalize SQL AVG output to Decimal so Pydantic serializes consistently.

    AVG over Numeric columns returns Decimal in asyncpg, but the COALESCE
    fallback path (zero rows) gives back a Python float. Round here so the
    JSON payload is stable across both branches.
    """
    if v is None:
        return None
    return Decimal(str(round(float(v), 2)))


@router.get("/stats", response_model=MeStatsOut)
async def get_me_stats(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> MeStatsOut:
    """Roll up the caller's lifetime scoring history.

    Joins `interview_sessions` to `session_metrics` and aggregates the
    cached per-session averages, weighting each session equally. We
    deliberately do NOT re-aggregate from `interview_turns` here — the
    metrics row is the source of truth for "session result" and using it
    keeps this query O(sessions) instead of O(turns).

    Sessions that finished BEFORE the metrics cache existed contribute
    `total_sessions` and `completed_sessions` but not the per-dimension
    averages (their metrics row is null). Acceptable for the demo: legacy
    rows wash out once a couple of new sessions land.
    """
    # Total / completed counts come straight from `interview_sessions`.
    counts_row = (await db.execute(
        select(
            func.count(InterviewSession.id).label("total"),
            func.count(InterviewSession.id).filter(
                InterviewSession.status == SessionStatus.completed
            ).label("completed"),
        ).where(InterviewSession.user_id == user.id)
    )).one()

    # Per-dimension averages + filler totals come from the cached metrics
    # rows for the user's COMPLETED sessions only.
    metrics_row = (await db.execute(
        select(
            func.avg(SessionMetrics.avg_structure).label("st"),
            func.avg(SessionMetrics.avg_problem_solving).label("ps"),
            func.avg(SessionMetrics.avg_impact).label("im"),
            func.avg(SessionMetrics.avg_initiative).label("ini"),
            func.avg(SessionMetrics.avg_depth).label("dp"),
            func.avg(SessionMetrics.avg_delivery).label("dl"),
            func.coalesce(
                func.sum(SessionMetrics.total_filler_word_count), 0
            ).label("fillers"),
            func.coalesce(
                func.sum(SessionMetrics.total_word_count), 0
            ).label("words"),
            func.coalesce(
                func.sum(SessionMetrics.turns_evaluated), 0
            ).label("turns"),
            func.avg(SessionMetrics.overall_score).label("overall"),
        )
        .join(
            InterviewSession,
            InterviewSession.id == SessionMetrics.session_id,
        )
        .where(
            InterviewSession.user_id == user.id,
            InterviewSession.status == SessionStatus.completed,
        )
    )).one()

    # Top-5 filler words. Per-word breakdown is only stored per TURN
    # (session_metrics caches just the total), so this one aggregate is
    # re-derived from interview_turns at query time — unlike the per-dimension
    # averages above. `jsonb_each_text` expands each turn's {word: count} map
    # into (key, value) rows we sum per word; the ::int cast is required since
    # it yields text. Secondary word-asc order makes ties deterministic.
    kv = func.jsonb_each_text(InterviewTurn.filler_word_breakdown).table_valued(
        "key", "value", joins_implicitly=True
    )
    filler_rows = (await db.execute(
        select(
            kv.c.key.label("word"),
            func.sum(kv.c.value.cast(Integer)).label("count"),
        )
        .select_from(InterviewTurn)
        .join(InterviewSession, InterviewSession.id == InterviewTurn.session_id)
        .where(
            InterviewSession.user_id == user.id,
            InterviewSession.status == SessionStatus.completed,
        )
        .group_by(kv.c.key)
        .order_by(desc("count"), kv.c.key.asc())
        .limit(5)
    )).all()
    top_filler_words = [
        FillerWordStat(word=r.word, count=int(r.count)) for r in filler_rows
    ]

    total_words = int(metrics_row.words or 0)
    total_fillers = int(metrics_row.fillers or 0)
    return MeStatsOut(
        total_sessions=counts_row.total or 0,
        completed_sessions=counts_row.completed or 0,
        total_turns_evaluated=int(metrics_row.turns or 0),
        total_filler_word_count=total_fillers,
        total_word_count=total_words,
        # Word-weighted lifetime rate (Σfillers / Σwords), not an average of
        # per-session rates — a 500-word session should count more than a
        # 20-word one.
        filler_word_rate=filler_rate_pct(total_fillers, total_words),
        averages=DimensionAverages(
            structure=_to_decimal(metrics_row.st),
            problem_solving=_to_decimal(metrics_row.ps),
            impact=_to_decimal(metrics_row.im),
            initiative=_to_decimal(metrics_row.ini),
            depth=_to_decimal(metrics_row.dp),
            delivery=_to_decimal(metrics_row.dl),
        ),
        average_overall_score=_to_decimal(metrics_row.overall),
        top_filler_words=top_filler_words,
    )
