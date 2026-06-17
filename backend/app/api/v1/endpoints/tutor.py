"""
Ask Tutor endpoint — a turn-scoped career-advisor chat streamed over SSE.

POST /api/v1/sessions/{session_id}/turns/{turn_id}/tutor

Flow:
  1. Ownership: the session must belong to the caller and the turn to the session.
  2. Moderation: the incoming message is screened by OpenAI moderation BEFORE the
     stream opens, so a blocked message returns a normal 422 (or 503 if moderation
     itself is down) over the regular JSON/ApiError path — never a half-open SSE.
  3. Stream: build the lean per-turn `TutorContext` from the already-loaded rows
     and stream the tool-calling reply as `text/event-stream`.

The route is declared with its full nested path and registered without a prefix,
so it lives next to `/sessions/{id}/turns` without coupling to the (large)
sessions router.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.sessions import _parse_company_summary
from app.core.auth import get_current_user_db
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.tutor import TutorMessageIn
from app.services.moderation import check_moderation
from app.services.tutor import REDIRECT_LINE, TutorContext, stream_tutor_reply

logger = logging.getLogger(__name__)

router = APIRouter()

# What we tell the candidate when their message trips a hard moderation block.
# Kept gentle and on-task; the frontend renders it as a tutor bubble.
_MODERATION_REFUSAL = (
    "I can't help with that message. " + REDIRECT_LINE
)


def _improvement_moments(feedback_detail: dict | None) -> list[dict]:
    """Pull the flagged moments out of the persisted feedback JSONB.

    Accepts the legacy `coaching_moments` key as a fallback (mirrors the
    wire-format `FeedbackDetailOut` normalizer)."""
    fd = feedback_detail or {}
    moments = fd.get("improvement_moments")
    if moments is None:
        moments = fd.get("coaching_moments")
    return moments if isinstance(moments, list) else []


def _build_context(
    session: InterviewSession, turn: InterviewTurn, user: User
) -> TutorContext:
    brief = _parse_company_summary(session.company_summary)
    fd = turn.feedback_detail or {}
    resume = (user.resume_text or "").strip()
    # Frozen session level is authoritative; fall back to the live profile level.
    level = session.experience_level or user.experience_level
    return TutorContext(
        question=turn.question_text,
        transcript=turn.transcript_text,
        experience_level=level,
        category=brief.category if brief else None,
        target_role=user.target_role,
        main_takeaway=fd.get("main_takeaway"),
        scores={
            "Structure": turn.structure_score,
            "Problem-solving": turn.problem_solving_score,
            "Impact": turn.impact_score,
            "Initiative": turn.initiative_score,
            "Depth": turn.depth_score,
            "Delivery": turn.delivery_score,
        },
        improvement_moments=_improvement_moments(turn.feedback_detail),
        company_name=session.company,
        job_title=session.job_title,
        company_description=brief.description if brief else None,
        company_values=brief.values if brief else [],
        company_headlines=brief.headlines if brief else [],
        role_signals=brief.role_signals if brief else [],
        sample_question_themes=brief.sample_question_themes if brief else [],
        short_bio=user.short_bio,
        resume_excerpt=resume[:1500] or None,
    )


def _sse(event: dict) -> str:
    return f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"


@router.post("/sessions/{session_id}/turns/{turn_id}/tutor")
async def ask_tutor(
    session_id: UUID,
    turn_id: UUID,
    body: TutorMessageIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    # 1. Ownership.
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    turn = await db.get(InterviewTurn, turn_id)
    if turn is None or turn.session_id != session.id:
        raise HTTPException(status_code=404, detail="Turn not found")

    # 2. Moderate the incoming message before any LLM spend. `flagged` → 422;
    #    a moderation outage raises ModerationUnavailableError → 503 (handled
    #    globally in main.py). Both land before the SSE stream opens.
    moderation = await check_moderation(
        body.message,
        user=user,
        db=db,
        session_id=session_id,
        metadata={"source": "tutor.message", "turn_id": str(turn_id)},
    )
    if moderation.flagged:
        logger.info(
            "Tutor message rejected by moderation session=%s turn=%s categories=%s",
            session_id,
            turn_id,
            moderation.categories,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_MODERATION_REFUSAL,
        )

    # 3. Build the lean context and stream the reply.
    ctx = _build_context(session, turn, user)

    message = body.message
    if body.context_snippet:
        snippet = body.context_snippet.strip()
        if snippet:
            message = (
                f'Regarding this part of my answer: "{snippet}" — {body.message}'
            )

    history = [{"role": h.role, "content": h.content} for h in body.history]

    async def event_stream():
        async for event in stream_tutor_reply(ctx, history, message):
            yield _sse(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy buffering (nginx/Caddy) so events flush live.
            "X-Accel-Buffering": "no",
        },
    )
