"""
POST /api/v1/sessions — start a new mock interview.

Flow (CLAUDE.md T+6-10, architecture steps 1 + 2 + TTS):
  1. Serper + Gemini 2.5 Flash → compact `CompanyBrief`.
  2. Gemini 2.5 Flash → one tailored opening question using the brief and
     the caller's profile (resume excerpt, target_role, industry, etc.).
  3. In parallel: ElevenLabs TTS → base64 data URL for the question, AND
     INSERT `interview_sessions` + turn 1 in a single transaction.
  4. Return `{session_id, summary, first_question, first_question_audio_url}`.

TTS and the DB write are independent (TTS doesn't need session.id, DB
doesn't need the audio), so we fan them out via `asyncio.gather` to avoid
stacking ~1s of ElevenLabs latency on top of the ~13s LLM round-trip.

Errors from any upstream bubble up as 500s — acceptable for the hackathon;
the frontend shows a note and the user retries.
"""

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.auth import get_current_user_db
from app.db.models.enums import SessionStatus
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session import CompanyBriefOut, SessionCreateIn, SessionCreateOut
from app.services.company_research import CompanyBrief, research_company
from app.services.opening_question import generate_opening_question
from app.services.tts import synthesize_speech

router = APIRouter()


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
