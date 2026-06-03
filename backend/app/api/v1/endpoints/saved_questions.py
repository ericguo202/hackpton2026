"""
Saved-questions endpoints — save & re-practice opening questions.

POST   /api/v1/saved-questions            — save an existing session's opening question
GET    /api/v1/saved-questions            — list the caller's saved questions (+ aggregates)
GET    /api/v1/saved-questions/{id}       — one saved question + all its practice attempts
DELETE /api/v1/saved-questions/{id}       — delete a saved question (sessions survive)
POST   /api/v1/saved-questions/{id}/practice — start a fresh re-practice attempt

Re-practice reuses the session-create machinery in `sessions.py` but skips the
two start-of-session LLM calls (company research + opening-question generation):
the question and the frozen brief are read straight off the saved row. It still
runs TTS (cheap, lets the voice vary per attempt), still gates the free-tier
daily limit, and returns the same `SessionCreateOut` shape so the existing
`Home -> /practice` handoff works unchanged.
"""

import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.enums import SessionStatus, UserTier
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.saved_question import SavedQuestion
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.saved_question import (
    RePracticeIn,
    SavedQuestionAttempt,
    SavedQuestionCreateIn,
    SavedQuestionDetailOut,
    SavedQuestionListItem,
    SavedQuestionOut,
)
from app.schemas.session import CompanyBriefOut, ScoresOut, SessionCreateOut
from app.api.v1.endpoints.sessions import (
    _parse_company_summary,
    _persist_session_and_turn,
)
from app.services.daily_limit import (
    DAILY_LIMIT_FREE,
    check_and_reset as daily_check_and_reset,
)
from app.services.incidents import (
    log_interview_session_started,
    log_save_question,
)
from app.services.tts import synthesize_speech
from app.services.voice_pool import is_valid_voice_id, voice_for_session

logger = logging.getLogger(__name__)

router = APIRouter()

# Hard cap on saved questions per user. No auto-eviction: a saved question
# carries accumulated practice history the user deliberately built, so we never
# silently replace the oldest. At the cap the save endpoint returns 409.
SAVED_QUESTION_CAP = 5


async def _get_owned_saved_question(
    db: AsyncSession, user: User, saved_question_id: UUID
) -> SavedQuestion:
    """Load a saved question and 404 unless it belongs to the caller."""
    sq = await db.get(SavedQuestion, saved_question_id)
    if sq is None or sq.user_id != user.id:
        raise HTTPException(status_code=404, detail="Saved question not found")
    return sq


async def _opening_turn(
    db: AsyncSession, session_id: UUID
) -> InterviewTurn | None:
    """Return the opening (turn 1, non-followup) turn for a session."""
    result = await db.execute(
        select(InterviewTurn)
        .where(
            InterviewTurn.session_id == session_id,
            InterviewTurn.is_followup.is_(False),
        )
        .order_by(InterviewTurn.turn_number)
        .limit(1)
    )
    return result.scalar_one_or_none()


# ── save ────────────────────────────────────────────────────────────────────

@router.post("", response_model=SavedQuestionOut, status_code=status.HTTP_201_CREATED)
async def save_question(
    body: SavedQuestionCreateIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SavedQuestionOut:
    # 1. Load + ownership.
    session = await db.get(InterviewSession, body.session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    # 2. Only a completed session is a valid baseline.
    if session.status != SessionStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only completed sessions can be saved.",
        )

    # 3. The OPENING turn specifically must be evaluated — `structure_score`
    #    non-null is the codebase's canonical "evaluated" check. A session
    #    whose turn 1 eval failed but turn 2 succeeded has a non-null
    #    overall_score yet no real attempt at the saved question, so gate on
    #    the opening turn, not the session aggregate.
    turn1 = await _opening_turn(db, session.id)
    if turn1 is None or turn1.structure_score is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "This question can't be saved — its opening answer wasn't "
                "scored. Finish a session where the first answer evaluates."
            ),
        )

    # 4. Dedup: if this exact question is already saved, return it idempotently
    #    rather than inserting a second row (the avoid-list usually prevents
    #    organic duplicates, but two save clicks shouldn't double-insert).
    existing = await db.execute(
        select(SavedQuestion).where(
            SavedQuestion.user_id == user.id,
            SavedQuestion.question_text == turn1.question_text,
        )
    )
    dup = existing.scalar_one_or_none()
    if dup is not None:
        # Make sure THIS session is linked as an attempt (write-once: only set
        # it if currently unlinked) so the baseline back-link still happens.
        if session.saved_question_id is None:
            session.saved_question_id = dup.id
            await db.commit()
        return SavedQuestionOut(
            id=dup.id,
            question_text=dup.question_text,
            company=dup.company,
            job_title=dup.job_title,
            created_at=dup.created_at,
        )

    # 5. Hard cap, server-enforced (two save entry points + double-click races).
    count_result = await db.execute(
        select(func.count())
        .select_from(SavedQuestion)
        .where(SavedQuestion.user_id == user.id)
    )
    if (count_result.scalar_one() or 0) >= SAVED_QUESTION_CAP:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"You can save up to {SAVED_QUESTION_CAP} questions. "
                "Delete one in History to save more."
            ),
        )

    # 6. Freeze the scenario. Brief fields come from the session's persisted
    #    `company_summary`; missing/legacy briefs degrade to empty lists.
    brief = _parse_company_summary(session.company_summary)
    sq = SavedQuestion(
        user_id=user.id,
        question_text=turn1.question_text,
        company=session.company,
        job_title=session.job_title,
        category=brief.category if brief else None,
        company_summary=session.company_summary,
        role_signals=brief.role_signals if brief else [],
        sample_question_themes=brief.sample_question_themes if brief else [],
        experience_level=session.experience_level,
    )
    db.add(sq)
    await db.flush()

    # 7. Back-link the originating session as attempt #1 (the baseline).
    session.saved_question_id = sq.id
    await db.commit()
    await db.refresh(sq)

    # Product analytics: log only genuinely new saves (not the dedup path) so
    # the popularity signal isn't inflated by repeat save clicks. Best-effort —
    # isolated session, swallows failures, never affects the response.
    await log_save_question(
        db,
        user,
        session_id=session.id,
        question_text=sq.question_text,
        metadata={
            "company": sq.company,
            "job_title": sq.job_title,
            "saved_question_id": sq.id,
        },
    )

    return SavedQuestionOut(
        id=sq.id,
        question_text=sq.question_text,
        company=sq.company,
        job_title=sq.job_title,
        created_at=sq.created_at,
    )


# ── list ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SavedQuestionListItem])
async def list_saved_questions(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> list[SavedQuestionListItem]:
    """The caller's saved questions, newest-first, with per-question aggregates
    computed over their linked practice sessions."""
    sq_result = await db.execute(
        select(SavedQuestion)
        .where(SavedQuestion.user_id == user.id)
        .order_by(SavedQuestion.created_at.desc())
    )
    saved = sq_result.scalars().all()
    if not saved:
        return []

    ids = [s.id for s in saved]
    # One grouped pass over linked sessions. SQL AVG ignores NULL overall_score,
    # so failed attempts are excluded from the average without a manual filter.
    agg_result = await db.execute(
        select(
            InterviewSession.saved_question_id,
            func.count().label("attempts"),
            func.max(InterviewSession.created_at).label("last_practiced_at"),
            func.avg(InterviewSession.overall_score).label("avg_overall"),
        )
        .where(InterviewSession.saved_question_id.in_(ids))
        .group_by(InterviewSession.saved_question_id)
    )
    agg = {row.saved_question_id: row for row in agg_result.all()}

    rows: list[SavedQuestionListItem] = []
    for s in saved:
        a = agg.get(s.id)
        rows.append(SavedQuestionListItem(
            id=s.id,
            question_text=s.question_text,
            company=s.company,
            job_title=s.job_title,
            created_at=s.created_at,
            attempt_count=a.attempts if a else 0,
            last_practiced_at=a.last_practiced_at if a else None,
            avg_overall_score=a.avg_overall if a else None,
        ))
    return rows


# ── detail ──────────────────────────────────────────────────────────────────

@router.get("/{saved_question_id}", response_model=SavedQuestionDetailOut)
async def get_saved_question(
    saved_question_id: UUID,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SavedQuestionDetailOut:
    sq = await _get_owned_saved_question(db, user, saved_question_id)

    # All linked sessions, oldest -> newest (progress reads left to right).
    sess_result = await db.execute(
        select(InterviewSession)
        .where(InterviewSession.saved_question_id == sq.id)
        .order_by(InterviewSession.created_at)
    )
    sessions = sess_result.scalars().all()

    # Opening turn per session in one query, keyed by session_id.
    turn1_by_session: dict[UUID, InterviewTurn] = {}
    if sessions:
        turn_result = await db.execute(
            select(InterviewTurn).where(
                InterviewTurn.session_id.in_([s.id for s in sessions]),
                InterviewTurn.is_followup.is_(False),
            )
        )
        for t in turn_result.scalars().all():
            # Keep the lowest turn_number per session (the opening turn).
            existing = turn1_by_session.get(t.session_id)
            if existing is None or t.turn_number < existing.turn_number:
                turn1_by_session[t.session_id] = t

    attempts: list[SavedQuestionAttempt] = []
    for s in sessions:
        t1 = turn1_by_session.get(s.id)
        evaluated = t1 is not None and t1.structure_score is not None
        turn1_scores = (
            ScoresOut(
                structure=t1.structure_score,
                problem_solving=t1.problem_solving_score,
                impact=t1.impact_score,
                initiative=t1.initiative_score,
                depth=t1.depth_score,
                delivery=t1.delivery_score,
            )
            if evaluated
            else None
        )
        attempts.append(SavedQuestionAttempt(
            session_id=s.id,
            created_at=s.created_at,
            overall_score=s.overall_score,
            turn1_scores=turn1_scores,
            evaluation_failed=not evaluated,
        ))

    return SavedQuestionDetailOut(
        id=sq.id,
        question_text=sq.question_text,
        company=sq.company,
        job_title=sq.job_title,
        category=sq.category,
        created_at=sq.created_at,
        summary=_parse_company_summary(sq.company_summary),
        attempts=attempts,
    )


# ── delete ──────────────────────────────────────────────────────────────────

@router.delete("/{saved_question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_question(
    saved_question_id: UUID,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> None:
    # Ownership check, then delete. The FK is ON DELETE SET NULL, so linked
    # sessions keep existing in History — only the grouping link is removed.
    await _get_owned_saved_question(db, user, saved_question_id)
    await db.execute(
        sql_delete(SavedQuestion).where(SavedQuestion.id == saved_question_id)
    )
    await db.commit()


# ── re-practice ──────────────────────────────────────────────────────────────

@router.post("/{saved_question_id}/practice", response_model=SessionCreateOut)
async def practice_saved_question(
    saved_question_id: UUID,
    body: RePracticeIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionCreateOut:
    sq = await _get_owned_saved_question(db, user, saved_question_id)

    # Persist the latest timezone (same as create_session) so the daily-limit
    # gate computes "today" in the user's local calendar consistently.
    if body.timezone and body.timezone != user.timezone:
        user.timezone = body.timezone
        await db.commit()

    # Free-tier daily-limit gate — a re-practice is a full session. Runs before
    # any TTS spend; counter still increments at finalization in submit_turn.
    if user.tier == UserTier.free:
        current_count = await daily_check_and_reset(db, user)
        if current_count >= DAILY_LIMIT_FREE:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"You have reached your daily limit of {DAILY_LIMIT_FREE} "
                    "interviews. Come back tomorrow."
                ),
            )

    # Everything is frozen on the saved row — no research / question-gen LLM
    # calls. The opening question and brief are read straight off it.
    opening_q = sq.question_text
    brief = _parse_company_summary(sq.company_summary)

    session_id = uuid.uuid4()
    if body.voice_id and is_valid_voice_id(body.voice_id):
        voice_id = body.voice_id
    else:
        voice_id = voice_for_session(session_id)

    audio_url = await synthesize_speech(opening_q, voice_id=voice_id)
    await _persist_session_and_turn(
        db,
        user,
        company=sq.company,
        job_title=sq.job_title,
        # Copy the frozen brief JSON so submit_turn re-parses the same
        # category / role_signals as the original attempt.
        company_summary=sq.company_summary or "",
        opening_q=opening_q,
        session_id=session_id,
        voice_id=voice_id,
        # Stamp the FROZEN level so the rubric matches earlier attempts even
        # after a profile change.
        experience_level=sq.experience_level,
        # Re-practice WANTS the repeat — don't add it to the avoid-list.
        roll_recent=False,
        saved_question_id=sq.id,
    )
    await log_interview_session_started(
        db,
        user,
        session_id=session_id,
        metadata={
            "company": sq.company,
            "job_title": sq.job_title,
            "saved_question_id": sq.id,
            "re_practice": True,
        },
    )

    summary = brief or CompanyBriefOut(description="", headlines=[])
    return SessionCreateOut(
        session_id=session_id,
        summary=summary,
        first_question=opening_q,
        first_question_audio_url=audio_url,
    )
