"""
Sessions endpoints.

POST /api/v1/sessions             — start a new mock interview.
POST /api/v1/sessions/{id}/turns  — submit an answer audio blob for evaluation.
GET  /api/v1/sessions             — list the caller's completed sessions.
GET  /api/v1/sessions/{id}        — full session detail (session + turns).
"""

import asyncio
import json
import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.auth import get_current_user_db
from app.db.models.enums import SessionStatus
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.session_metrics import SessionMetrics
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session import (
    CompanyBriefOut,
    DimensionAverages,
    ScoresOut,
    SessionCreateIn,
    SessionCreateOut,
    SessionDetailOut,
    SessionListItem,
    TurnOut,
    TurnSubmitOut,
)
from app.services.company_research import CompanyBrief, research_company
from app.services.evaluator import GEMMA_EVAL_MODEL, evaluate_turn
from app.services.filler_words import count_filler_words
from app.services.followup import generate_followup
from app.services.opening_question import generate_opening_question
from app.services.stt import transcribe_audio
from app.services.tts import synthesize_speech

logger = logging.getLogger(__name__)

router = APIRouter()


# ── session creation ──────────────────────────────────────────────────────────

async def _persist_session_and_turn(
    db: AsyncSession,
    user: User,
    body: SessionCreateIn,
    brief: CompanyBrief,
    opening_q: str,
) -> UUID:
    """INSERT the session row + turn 1 atomically; return session.id."""
    session = InterviewSession(
        user_id=user.id,
        company=body.company,
        job_title=body.job_title,
        company_summary=brief.model_dump_json(),
        status=SessionStatus.in_progress,
        started_at=func.now(),
    )
    db.add(session)
    # Flush (not commit) so session.id is populated before we create the turn
    # row that FK-references it. Both rows still land atomically on commit.
    await db.flush()

    turn = InterviewTurn(
        session_id=session.id,
        turn_number=1,
        question_text=opening_q,
        is_followup=False,
    )
    db.add(turn)
    await db.commit()
    await db.refresh(session)
    return session.id


@router.post("", response_model=SessionCreateOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreateIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionCreateOut:
    brief = await research_company(body.company)
    opening_q = await generate_opening_question(user, brief, body.job_title)

    audio_url, session_id = await asyncio.gather(
        synthesize_speech(opening_q),
        _persist_session_and_turn(db, user, body, brief, opening_q),
    )

    return SessionCreateOut(
        session_id=session_id,
        summary=CompanyBriefOut(**brief.model_dump()),
        first_question=opening_q,
        first_question_audio_url=audio_url,
    )


# ── turn submission ───────────────────────────────────────────────────────────

async def _insert_followup_turn(
    db: AsyncSession,
    session_id: UUID,
    parent_turn_id: UUID,
    question: str,
) -> None:
    """Insert turn 2 and flush (caller commits)."""
    db.add(InterviewTurn(
        session_id=session_id,
        turn_number=2,
        question_text=question,
        is_followup=True,
        parent_turn_id=parent_turn_id,
    ))
    await db.flush()


async def _followup_and_tts(question: str, transcript: str) -> tuple[str, str]:
    """Generate follow-up via Flash then TTS — runs in parallel with Gemma 4 eval."""
    next_q = await generate_followup(question, transcript)
    audio_url = await synthesize_speech(next_q)
    return next_q, audio_url


# ── session-completion aggregation ────────────────────────────────────────────

# Per-turn score tuple shape used by the aggregator below:
# (directness, star, specificity, impact, conciseness, delivery|None, fillers)
_TurnScores = tuple[float, float, float, float, float, float | None, int]


def _per_dimension_averages(turns: list[_TurnScores]) -> dict[str, float | None]:
    """Average each rubric dimension independently across `turns`.

    `delivery` is averaged only over turns where the candidate had the
    camera on; if every turn is camera-off the key is None and the
    history chart drops the line entirely instead of plotting zeros.
    """
    def _avg(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 2) if values else None

    return {
        "directness":  _avg([t[0] for t in turns]),
        "star":        _avg([t[1] for t in turns]),
        "specificity": _avg([t[2] for t in turns]),
        "impact":      _avg([t[3] for t in turns]),
        "conciseness": _avg([t[4] for t in turns]),
        "delivery":    _avg([t[5] for t in turns if t[5] is not None]),
    }


async def _upsert_session_metrics(
    db: AsyncSession,
    *,
    session_id: UUID,
    averages: dict[str, float | None],
    total_filler_word_count: int,
    overall_score: float,
    turns_evaluated: int,
) -> None:
    """Write (or replace) the cached aggregate row for a completed session.

    `session_metrics.session_id` has a UNIQUE constraint, so a re-finalize
    of the same session (shouldn't happen in the 2-turn flow but cheap
    insurance) deletes the existing row first rather than tripping IntegrityError.
    """
    existing = await db.execute(
        select(SessionMetrics).where(SessionMetrics.session_id == session_id)
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.flush()

    db.add(SessionMetrics(
        session_id=session_id,
        avg_directness=averages["directness"],
        avg_star=averages["star"],
        avg_specificity=averages["specificity"],
        avg_impact=averages["impact"],
        avg_conciseness=averages["conciseness"],
        avg_delivery=averages["delivery"],
        total_filler_word_count=total_filler_word_count,
        overall_score=overall_score,
        turns_evaluated=turns_evaluated,
    ))
    await db.flush()


@router.post("/{session_id}/turns", response_model=TurnSubmitOut)
async def submit_turn(
    session_id: UUID,
    audio: UploadFile = File(...),
    # Browser-computed webcam analytics (see `faceHeuristics.ts` on the
    # frontend). JSON-encoded; missing when the candidate declined camera.
    # Parse failures degrade gracefully to the 5-score path rather than 400.
    cv_summary: str | None = Form(None),
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> TurnSubmitOut:
    # 1. Load session — verify ownership.
    session = await db.get(InterviewSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    # 2. Find the current unanswered turn (question exists, transcript is NULL).
    result = await db.execute(
        select(InterviewTurn)
        .where(
            InterviewTurn.session_id == session_id,
            InterviewTurn.transcript_text.is_(None),
        )
        .order_by(InterviewTurn.turn_number)
        .limit(1)
    )
    current_turn = result.scalar_one_or_none()
    if current_turn is None:
        raise HTTPException(status_code=400, detail="No pending turn for this session")

    # 3. Transcribe.
    audio_bytes = await audio.read()
    transcript = await transcribe_audio(audio_bytes, audio.filename or "audio.webm")

    # 4. Filler words (regex ground truth per CLAUDE.md).
    filler_count, filler_breakdown = count_filler_words(transcript)

    # 5. Collect prior evaluated turns for history context.
    prior_result = await db.execute(
        select(InterviewTurn)
        .where(
            InterviewTurn.session_id == session_id,
            InterviewTurn.transcript_text.isnot(None),
        )
        .order_by(InterviewTurn.turn_number)
    )
    prior_turns = prior_result.scalars().all()
    history = [
        {"question": t.question_text, "transcript": t.transcript_text}
        for t in prior_turns
    ]

    # 6. Parse webcam analytics sidecar if present. Failing closed (None)
    # keeps the turn viable; the evaluator just skips the delivery score.
    parsed_cv_summary: dict | None = None
    if cv_summary:
        try:
            loaded = json.loads(cv_summary)
            if isinstance(loaded, dict):
                parsed_cv_summary = loaded
            else:
                logger.warning("cv_summary payload was not a JSON object; ignoring")
        except json.JSONDecodeError as exc:
            logger.warning("cv_summary JSON parse failed: %s", exc)

    # 7. Hardcoded 2-turn rule (CLAUDE.md): turn 2 is always final.
    is_final = current_turn.turn_number >= 2

    # 8. Evaluate scores and generate follow-up question in parallel.
    # Gemma 4 (scoring) and Flash+TTS (next question) start simultaneously;
    # TTS is no longer on the critical path after Gemma 4 finishes.
    if not is_final:
        eval_out, (next_q, next_audio_url) = await asyncio.gather(
            evaluate_turn(
                current_turn.question_text, transcript, history,
                cv_summary=parsed_cv_summary,
            ),
            _followup_and_tts(current_turn.question_text, transcript),
        )
    else:
        eval_out = await evaluate_turn(
            current_turn.question_text, transcript, history,
            cv_summary=parsed_cv_summary,
        )
        next_q = None
        next_audio_url = None

    # 9. Write scores + transcript back to the current turn.
    current_turn.transcript_text       = transcript
    current_turn.directness_score      = eval_out.directness
    current_turn.star_score            = eval_out.star
    current_turn.specificity_score     = eval_out.specificity
    current_turn.impact_score          = eval_out.impact
    current_turn.conciseness_score     = eval_out.conciseness
    current_turn.delivery_score        = eval_out.delivery
    current_turn.cv_summary            = parsed_cv_summary
    current_turn.filler_word_count     = filler_count
    current_turn.filler_word_breakdown = filler_breakdown
    current_turn.feedback              = eval_out.notes
    current_turn.ai_model_used         = GEMMA_EVAL_MODEL
    current_turn.evaluated_at          = datetime.utcnow()

    if not is_final and next_q:
        await _insert_followup_turn(db, session_id, current_turn.id, next_q)
    elif is_final:
        # Aggregate all evaluated turns (prior_turns + the current one we
        # just scored above). Each dimension is averaged independently so a
        # null `delivery` on one turn doesn't contaminate the others.
        all_turn_scores = [
            (
                float(t.directness_score),
                float(t.star_score),
                float(t.specificity_score),
                float(t.impact_score),
                float(t.conciseness_score),
                float(t.delivery_score) if t.delivery_score is not None else None,
                int(t.filler_word_count or 0),
            )
            for t in prior_turns
        ] + [(
            float(eval_out.directness),
            float(eval_out.star),
            float(eval_out.specificity),
            float(eval_out.impact),
            float(eval_out.conciseness),
            float(eval_out.delivery) if eval_out.delivery is not None else None,
            filler_count,
        )]
        per_dim_avgs = _per_dimension_averages(all_turn_scores)
        total_fillers = sum(t[6] for t in all_turn_scores)
        # Overall: average of every populated dimension score across every
        # turn, scaled 0-10 → 0-100. Matches the prior behavior so existing
        # rows in `interview_sessions.overall_score` remain comparable.
        flat_scores = [
            v for t in all_turn_scores for v in t[:6] if v is not None
        ]
        overall = (
            round(sum(flat_scores) / len(flat_scores) * 10, 2)
            if flat_scores else 0.0
        )
        overall = min(99.99, overall)

        session.status        = SessionStatus.completed
        session.ended_at      = func.now()
        session.overall_score = overall

        await _upsert_session_metrics(
            db,
            session_id=session_id,
            averages=per_dim_avgs,
            total_filler_word_count=total_fillers,
            overall_score=overall,
            turns_evaluated=len(all_turn_scores),
        )

    await db.commit()

    return TurnSubmitOut(
        transcript=transcript,
        scores=ScoresOut(
            directness=eval_out.directness,
            star=eval_out.star,
            specificity=eval_out.specificity,
            impact=eval_out.impact,
            conciseness=eval_out.conciseness,
            delivery=eval_out.delivery,
        ),
        feedback=eval_out.notes,
        filler_word_count=filler_count,
        filler_word_breakdown=filler_breakdown,
        next_question=next_q,
        next_question_audio_url=next_audio_url,
        is_final=is_final,
    )


# ── history routes ───────────────────────────────────────────────────────────

# Hard cap on `GET /sessions` rows. The history page renders a chart + table
# inline, so paging UI is overkill for the demo — 50 most-recent completed
# sessions is well past anything a user will rack up during the hackathon.
_HISTORY_LIMIT = 50


def _averages_from_metrics(m: SessionMetrics | None) -> DimensionAverages:
    """Adapt the cached metrics row to the wire-format averages object."""
    if m is None:
        return DimensionAverages()
    return DimensionAverages(
        directness=m.avg_directness,
        star=m.avg_star,
        specificity=m.avg_specificity,
        impact=m.avg_impact,
        conciseness=m.avg_conciseness,
        delivery=m.avg_delivery,
    )


def _parse_company_summary(raw: str | None) -> CompanyBriefOut | None:
    """Decode the persisted JSON brief back into the wire-format model.

    Returns None on missing or malformed payloads so a single bad row in
    history doesn't 500 the whole detail screen.
    """
    if not raw:
        return None
    try:
        return CompanyBriefOut.model_validate_json(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("company_summary parse failed: %s", exc)
        return None


@router.get("", response_model=list[SessionListItem])
async def list_sessions(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> list[SessionListItem]:
    """Return the caller's completed sessions, newest first.

    Per-dimension averages are read from the cached `session_metrics` row
    populated when the session finalized. Sessions that finished BEFORE
    that cache existed (legacy rows) come back with all averages = null;
    the frontend chart simply skips them.
    """
    result = await db.execute(
        select(InterviewSession, SessionMetrics)
        .outerjoin(
            SessionMetrics,
            SessionMetrics.session_id == InterviewSession.id,
        )
        .where(
            InterviewSession.user_id == user.id,
            InterviewSession.status == SessionStatus.completed,
        )
        .order_by(InterviewSession.created_at.desc())
        .limit(_HISTORY_LIMIT)
    )
    rows: list[SessionListItem] = []
    for session, metrics in result.all():
        rows.append(SessionListItem(
            id=session.id,
            company=session.company,
            job_title=session.job_title,
            status=session.status.value,
            overall_score=session.overall_score,
            started_at=session.started_at,
            ended_at=session.ended_at,
            created_at=session.created_at,
            turns_evaluated=metrics.turns_evaluated if metrics else 0,
            total_filler_word_count=(
                metrics.total_filler_word_count if metrics else None
            ),
            averages=_averages_from_metrics(metrics),
        ))
    return rows


@router.get("/{session_id}", response_model=SessionDetailOut)
async def get_session(
    session_id: UUID,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionDetailOut:
    """Full session payload: session row + ordered turns + cached metrics.

    Ownership check happens BEFORE we fetch turns so an unauthorized
    request can't probe for another user's row counts via timing.
    """
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    turns_result = await db.execute(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.turn_number)
    )
    turns = turns_result.scalars().all()

    metrics_result = await db.execute(
        select(SessionMetrics).where(SessionMetrics.session_id == session_id)
    )
    metrics = metrics_result.scalar_one_or_none()

    turn_outs = [
        TurnOut(
            id=t.id,
            turn_number=t.turn_number,
            question_text=t.question_text,
            transcript_text=t.transcript_text,
            is_followup=t.is_followup,
            scores=ScoresOut(
                # `0` is a valid evaluator score; coerce nulls to 0 only for
                # turns that haven't been evaluated yet (transcript is null).
                # An evaluated turn always has all 5 base scores populated.
                directness=int(t.directness_score or 0),
                star=int(t.star_score or 0),
                specificity=int(t.specificity_score or 0),
                impact=int(t.impact_score or 0),
                conciseness=int(t.conciseness_score or 0),
                delivery=(
                    int(t.delivery_score) if t.delivery_score is not None else None
                ),
            ),
            feedback=t.feedback,
            filler_word_count=t.filler_word_count or 0,
            filler_word_breakdown=t.filler_word_breakdown or {},
            evaluated_at=t.evaluated_at,
            created_at=t.created_at,
        )
        for t in turns
    ]

    return SessionDetailOut(
        id=session.id,
        company=session.company,
        job_title=session.job_title,
        status=session.status.value,
        overall_score=session.overall_score,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        summary=_parse_company_summary(session.company_summary),
        turns=turn_outs,
        averages=_averages_from_metrics(metrics),
        total_filler_word_count=(
            metrics.total_filler_word_count if metrics else None
        ),
        turns_evaluated=metrics.turns_evaluated if metrics else 0,
    )
