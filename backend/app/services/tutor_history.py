"""
The candidate's own practice record, shaped for a prompt.

This is the payload behind the general Ask-Tutor `get_interview_history` tool.
The coach on `/tutor` is asked things no single session can answer — "what am I
weakest at?", "what should I practice next?", "have I gotten better?" — and it
must never guess at a score, so it pulls the real numbers on demand.

Two rollups, both over COMPLETED sessions only:

  - the last `_RECENT_SESSION_LIMIT` sessions, each with its per-dimension
    averages LABELLED by that session's question category (a bare
    "dimension_3: 6.4" is meaningless when position 3 is Impact for STAR and
    Company Insight for Motivation & Fit), plus filler rate and speaking pace;
  - lifetime averages, the same word-weighted filler rate `/me/stats` reports,
    and the per-question-category breakdown.

The numbers mirror `GET /me/stats` (`app/api/v1/endpoints/me.py`) — keep them
consistent — but that endpoint can't be reused directly: it is a response-model
handler carrying company / role / pure-category filter machinery this tool has no
use for, and it needs a request-scoped session. This runs from inside the SSE
generator, past the request session's lifecycle, so it opens its OWN
`AsyncSessionLocal` (same isolation rationale as `daily_limit.record_chat_completion`
and incident logging).

Output is a plain dict of JSON-safe primitives, ready for `json.dumps` as a tool
result. Decimals are rounded to one place — a coach says "6.4", not
"6.4000000000".
"""

from __future__ import annotations

import logging
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select

from app.db.models.enums import SessionStatus
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.session_metrics import SessionMetrics
from app.db.session import AsyncSessionLocal
from app.services._score_dimensions import (
    DELIVERY_LABEL,
    content_dimension_labels,
    question_category_label,
)
from app.services.filler_words import filler_rate_pct, speaking_pace_wpm

logger = logging.getLogger(__name__)

# How far back the coach can see. Five is enough to talk about a trend without
# turning a chat reply's context into a spreadsheet.
_RECENT_SESSION_LIMIT = 5


def _round1(value) -> float | None:
    """One-decimal float, or None. Averages arrive as Decimal or float
    depending on the driver, so coerce defensively."""
    if value is None:
        return None
    try:
        return float(round(Decimal(str(value)), 1))
    except (ValueError, ArithmeticError):
        return None


def _labelled_dimensions(category, metrics: SessionMetrics | None) -> dict:
    """Map a metrics row's five generic averages onto that category's labels."""
    if metrics is None:
        return {}
    labels = content_dimension_labels(category)
    values = (
        metrics.avg_dimension_1,
        metrics.avg_dimension_2,
        metrics.avg_dimension_3,
        metrics.avg_dimension_4,
        metrics.avg_dimension_5,
    )
    scored = {
        label: _round1(value)
        for label, value in zip(labels, values)
        if value is not None
    }
    if metrics.avg_delivery is not None:
        scored[DELIVERY_LABEL] = _round1(metrics.avg_delivery)
    return scored


def _category_name(cat_count: int | None, cat_min) -> str:
    """Human name for a session's question type.

    Mirrors the `SessionListItem` derivation in `sessions.list_sessions`: one
    distinct category across the turns means the session IS that category; more
    than one means it was a Recommended Mix.
    """
    if not cat_count:
        return "unknown"
    if cat_count > 1:
        return "Recommended Mix (multiple question types)"
    return question_category_label(cat_min)


async def interview_history_digest(user_id: UUID) -> dict:
    """Return the caller's recent sessions + lifetime averages as a JSON-safe dict.

    Never raises for "no history" — an empty record comes back with an explicit
    `note` so the model coaches generically instead of inventing scores.
    """
    async with AsyncSessionLocal() as db:
        # Per-session category rollup, same shape as the History list query.
        cat_subq = (
            select(
                InterviewTurn.session_id.label("sid"),
                func.count(func.distinct(InterviewTurn.question_category)).label(
                    "cat_count"
                ),
                func.min(InterviewTurn.question_category).label("cat_min"),
            )
            .group_by(InterviewTurn.session_id)
            .subquery()
        )
        recent_rows = (
            await db.execute(
                select(
                    InterviewSession,
                    SessionMetrics,
                    cat_subq.c.cat_count,
                    cat_subq.c.cat_min,
                )
                .outerjoin(
                    SessionMetrics,
                    SessionMetrics.session_id == InterviewSession.id,
                )
                .outerjoin(cat_subq, cat_subq.c.sid == InterviewSession.id)
                .where(
                    InterviewSession.user_id == user_id,
                    InterviewSession.status == SessionStatus.completed,
                )
                .order_by(InterviewSession.created_at.desc())
                .limit(_RECENT_SESSION_LIMIT)
            )
        ).all()

        sessions: list[dict] = []
        for session, metrics, cat_count, cat_min in recent_rows:
            category = None if not cat_count or cat_count > 1 else cat_min
            fillers = metrics.total_filler_word_count if metrics else None
            words = metrics.total_word_count if metrics else None
            seconds = metrics.total_duration_seconds if metrics else None
            entry = {
                "date": (session.ended_at or session.created_at).date().isoformat(),
                "company": session.company,
                "role": session.job_title,
                "question_type": _category_name(cat_count, cat_min),
                "turns_scored": metrics.turns_evaluated if metrics else 0,
                "overall_score_out_of_100": _round1(session.overall_score),
                "scores_out_of_10": _labelled_dimensions(category, metrics),
            }
            rate = filler_rate_pct(fillers, words)
            if rate is not None:
                entry["filler_word_rate_pct"] = _round1(rate)
            pace = speaking_pace_wpm(words, seconds)
            if pace is not None:
                entry["speaking_pace_wpm"] = pace
            sessions.append(entry)

        if not sessions:
            return {
                "sessions": [],
                "note": (
                    "This candidate has not completed any practice sessions yet, "
                    "so there are no scores to refer to. Coach them generally and "
                    "encourage them to run a session."
                ),
            }

        # Lifetime averages over the cached per-session metrics. Deliberately the
        # same source `/me/stats` uses, so the two never disagree.
        totals = (
            await db.execute(
                select(
                    func.avg(SessionMetrics.avg_dimension_1).label("d1"),
                    func.avg(SessionMetrics.avg_dimension_2).label("d2"),
                    func.avg(SessionMetrics.avg_dimension_3).label("d3"),
                    func.avg(SessionMetrics.avg_dimension_4).label("d4"),
                    func.avg(SessionMetrics.avg_dimension_5).label("d5"),
                    func.avg(SessionMetrics.avg_delivery).label("delivery"),
                    func.avg(SessionMetrics.overall_score).label("overall"),
                    func.coalesce(
                        func.sum(SessionMetrics.total_filler_word_count), 0
                    ).label("fillers"),
                    func.coalesce(
                        func.sum(SessionMetrics.total_word_count), 0
                    ).label("words"),
                    func.coalesce(
                        func.sum(SessionMetrics.turns_evaluated), 0
                    ).label("turns"),
                    func.count(SessionMetrics.id).label("sessions"),
                )
                .join(
                    InterviewSession,
                    InterviewSession.id == SessionMetrics.session_id,
                )
                .where(
                    InterviewSession.user_id == user_id,
                    InterviewSession.status == SessionStatus.completed,
                )
            )
        ).one()

        # Per-question-category rollup, grouped from turns so it spans Mix
        # sessions correctly (same query as `/me/stats.by_category`). The
        # per-category score is the mean of that category's five content dims.
        content_mean = (
            InterviewTurn.dimension_1_score
            + InterviewTurn.dimension_2_score
            + InterviewTurn.dimension_3_score
            + InterviewTurn.dimension_4_score
            + InterviewTurn.dimension_5_score
        ) / 5.0
        category_rows = (
            await db.execute(
                select(
                    InterviewTurn.question_category.label("cat"),
                    func.count(InterviewTurn.id).label("turns"),
                    func.avg(content_mean).label("avg_score"),
                )
                .select_from(InterviewTurn)
                .join(
                    InterviewSession,
                    InterviewSession.id == InterviewTurn.session_id,
                )
                .where(
                    InterviewSession.user_id == user_id,
                    InterviewSession.status == SessionStatus.completed,
                    InterviewTurn.dimension_1_score.isnot(None),
                )
                .group_by(InterviewTurn.question_category)
            )
        ).all()

    total_words = int(totals.words or 0)
    total_fillers = int(totals.fillers or 0)
    lifetime = {
        "completed_sessions": int(totals.sessions or 0),
        "answers_scored": int(totals.turns or 0),
        "average_overall_score_out_of_100": _round1(totals.overall),
        # Position-generic on purpose: a lifetime average pools every question
        # type, and only position 1 (Structure) and Delivery mean the same thing
        # across all four. The per-type breakdown below is the meaningful cut.
        "average_structure_out_of_10": _round1(totals.d1),
        "average_delivery_out_of_10": _round1(totals.delivery),
        "filler_word_rate_pct": _round1(
            filler_rate_pct(total_fillers, total_words)
        ),
        "by_question_type": [
            {
                "question_type": question_category_label(row.cat),
                "average_content_score_out_of_10": _round1(row.avg_score),
                "answers_scored": int(row.turns or 0),
            }
            for row in category_rows
        ],
    }

    return {
        "recent_sessions_newest_first": sessions,
        "lifetime": lifetime,
        "note": (
            "Scores are 0-10 per dimension (except overall, which is 0-100). A "
            "dimension's meaning depends on the question type — call get_rubric "
            "if you need to explain what one measures."
        ),
    }
