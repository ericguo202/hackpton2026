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

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import Integer, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import ClerkClaims, current_user, get_current_user_db
from app.db.models.enums import SessionStatus, UserTier
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.session_metrics import SessionMetrics
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session import DimensionAverages, FillerWordStat, MeStatsOut
from app.schemas.user import UserOut
from app.services.daily_limit import check_and_reset as daily_check_and_reset
from app.services.filler_words import filler_rate_pct

router = APIRouter()


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
