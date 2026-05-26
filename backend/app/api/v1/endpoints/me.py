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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.enums import SessionStatus, UserTier
from app.db.models.interview_session import InterviewSession
from app.db.models.session_metrics import SessionMetrics
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session import DimensionAverages, MeStatsOut
from app.schemas.user import UserOut
from app.services.daily_limit import check_and_reset as daily_check_and_reset

router = APIRouter()


@router.get("", response_model=UserOut)
async def get_me(
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

    return MeStatsOut(
        total_sessions=counts_row.total or 0,
        completed_sessions=counts_row.completed or 0,
        total_turns_evaluated=int(metrics_row.turns or 0),
        total_filler_word_count=int(metrics_row.fillers or 0),
        averages=DimensionAverages(
            structure=_to_decimal(metrics_row.st),
            problem_solving=_to_decimal(metrics_row.ps),
            impact=_to_decimal(metrics_row.im),
            initiative=_to_decimal(metrics_row.ini),
            depth=_to_decimal(metrics_row.dp),
            delivery=_to_decimal(metrics_row.dl),
        ),
        average_overall_score=_to_decimal(metrics_row.overall),
    )
