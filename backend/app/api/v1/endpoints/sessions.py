"""
Sessions endpoints.

POST /api/v1/sessions             — start a new mock interview.
POST /api/v1/sessions/{id}/turns  — submit an answer audio blob for evaluation.
"""

import asyncio
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.auth import get_current_user_db
from app.db.models.enums import SessionStatus
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session import (
    CompanyBriefOut,
    ScoresOut,
    SessionCreateIn,
    SessionCreateOut,
    TurnSubmitOut,
)
from app.services.company_research import CompanyBrief, research_company
from app.services.evaluator import GEMMA_EVAL_MODEL, evaluate_turn
from app.services.filler_words import count_filler_words
from app.services.followup import generate_followup
from app.services.opening_question import generate_opening_question
from app.services.stt import transcribe_audio
from app.services.tts import synthesize_speech

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


@router.post("/{session_id}/turns", response_model=TurnSubmitOut)
async def submit_turn(
    session_id: UUID,
    audio: UploadFile = File(...),
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

    # 6. Hardcoded 2-turn rule (CLAUDE.md): turn 2 is always final.
    is_final = current_turn.turn_number >= 2

    # 7. Evaluate scores and generate follow-up question in parallel.
    # Gemma 4 (scoring) and Flash+TTS (next question) start simultaneously;
    # TTS is no longer on the critical path after Gemma 4 finishes.
    if not is_final:
        eval_out, (next_q, next_audio_url) = await asyncio.gather(
            evaluate_turn(current_turn.question_text, transcript, history),
            _followup_and_tts(current_turn.question_text, transcript),
        )
    else:
        eval_out = await evaluate_turn(current_turn.question_text, transcript, history)
        next_q = None
        next_audio_url = None

    # 8. Write scores + transcript back to the current turn.
    current_turn.transcript_text       = transcript
    current_turn.directness_score      = eval_out.directness
    current_turn.star_score            = eval_out.star
    current_turn.specificity_score     = eval_out.specificity
    current_turn.impact_score          = eval_out.impact
    current_turn.conciseness_score     = eval_out.conciseness
    current_turn.filler_word_count     = filler_count
    current_turn.filler_word_breakdown = filler_breakdown
    current_turn.feedback              = eval_out.notes
    current_turn.ai_model_used         = GEMMA_EVAL_MODEL
    current_turn.evaluated_at          = datetime.utcnow()

    if not is_final and next_q:
        await _insert_followup_turn(db, session_id, current_turn.id, next_q)
    elif is_final:
        # Average all rubric scores across both turns, scale to 0-100.
        all_scores = [
            float(s)
            for t in prior_turns
            for s in (t.directness_score, t.star_score, t.specificity_score,
                      t.impact_score, t.conciseness_score)
            if s is not None
        ] + [
            float(eval_out.directness), float(eval_out.star),
            float(eval_out.specificity), float(eval_out.impact),
            float(eval_out.conciseness),
        ]
        overall = round(sum(all_scores) / len(all_scores) * 10, 2) if all_scores else 0.0
        session.status        = SessionStatus.completed
        session.ended_at      = func.now()
        session.overall_score = min(99.99, overall)

    await db.commit()

    return TurnSubmitOut(
        transcript=transcript,
        scores=ScoresOut(
            directness=eval_out.directness,
            star=eval_out.star,
            specificity=eval_out.specificity,
            impact=eval_out.impact,
            conciseness=eval_out.conciseness,
        ),
        feedback=eval_out.notes,
        filler_word_count=filler_count,
        filler_word_breakdown=filler_breakdown,
        next_question=next_q,
        next_question_audio_url=next_audio_url,
        is_final=is_final,
    )
