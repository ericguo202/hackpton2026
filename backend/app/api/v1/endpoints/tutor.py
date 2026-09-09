"""
Ask Tutor endpoints — the career-advisor chat, streamed over SSE, on two surfaces.

POST /api/v1/sessions/{session_id}/turns/{turn_id}/tutor   turn-scoped chat
POST /api/v1/tutor                                         general coach

Both run the same service (`app/services/tutor.py`) under different
`TutorMode`s, and both follow the same gate order, which is load-bearing:

  1. Ownership (turn route only): the session must belong to the caller and the
     turn to the session.
  2. Chat credits: a read-only pre-check BEFORE any spend — 429 when the caller's
     remaining daily credits can't cover this chat. A turn chat costs 1 credit, a
     general chat 2 (see `daily_limit`). The charge lands only on success.
  3. Injection: the deterministic regex gate on the candidate-authored text. Free
     and local, so it runs before the billed moderation call and logs a WARNING
     incident.
  4. Moderation: OpenAI moderation BEFORE the stream opens, so a blocked message
     returns a normal 422 (or 503 if moderation itself is down) over the regular
     JSON/ApiError path — never a half-open SSE.
  5. Stream: build the lean context from the already-loaded rows and stream the
     tool-calling reply as `text/event-stream`.

Both routes are declared with their full paths and registered without a prefix,
so the nested one lives next to `/sessions/{id}/turns` without coupling to the
(large) sessions router.
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
from app.db.models.enums import UserTier
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.tutor import GeneralTutorMessageIn, TutorMessageIn
from app.services._score_dimensions import (
    DELIVERY_LABEL,
    content_dimension_labels,
)
from app.services._injection import contains_injection
from app.services.daily_limit import (
    GENERAL_CHAT_CREDIT_COST,
    TURN_CHAT_CREDIT_COST,
    enforce_chat_daily_limit,
    record_chat_completion,
)
from app.services.incidents import log_injection_detected
from app.services.moderation import check_moderation
from app.services.tutor import (
    REDIRECT_LINE,
    GeneralTutorContext,
    TutorContext,
    TutorMode,
    stream_tutor_reply,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# What we tell the candidate when their message trips a hard moderation block
# or the deterministic injection gate. Kept gentle and on-task; the frontend
# renders it as a tutor bubble. A single shared line avoids signalling which
# guard fired.
_MODERATION_REFUSAL = (
    "I can't help with that message. " + REDIRECT_LINE
)
_INJECTION_REFUSAL = _MODERATION_REFUSAL

# Longest single field the tools hand back; mirrors `_RESUME_EXCERPT_CHARS` in
# the service so a 3-page résumé can't blow the lean context back open.
_RESUME_EXCERPT_CHARS = 1500


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
        # Question-FORM axis — selects the rubric the five dimensions were
        # scored against (and the labels used for them below).
        question_category=turn.question_category,
        target_role=user.target_role,
        main_takeaway=fd.get("main_takeaway"),
        # Label the five generic dimension columns per the turn's question
        # category (STAR vs Motivation & Fit name them differently). Ordered
        # dict → `_render_scores` renders it in position order.
        scores={
            **{
                label: score
                for label, score in zip(
                    content_dimension_labels(turn.question_category),
                    (
                        turn.dimension_1_score,
                        turn.dimension_2_score,
                        turn.dimension_3_score,
                        turn.dimension_4_score,
                        turn.dimension_5_score,
                    ),
                )
            },
            DELIVERY_LABEL: turn.delivery_score,
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
        resume_excerpt=resume[:_RESUME_EXCERPT_CHARS] or None,
    )


def _build_general_context(user: User) -> GeneralTutorContext:
    """The general coach's context: who this candidate is, and nothing else.

    Their résumé, bio and whole practice history sit behind tools, so this stays
    a handful of fields no matter how much they've practiced.
    """
    resume = (user.resume_text or "").strip()
    return GeneralTutorContext(
        user_id=user.id,
        experience_level=user.experience_level,
        target_role=user.target_role,
        target_roles=list(user.target_roles or []),
        industry=user.industry,
        short_bio=user.short_bio,
        resume_excerpt=resume[:_RESUME_EXCERPT_CHARS] or None,
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

    # 2. Daily chat-completion cap (free tier). Read-only pre-check BEFORE
    #    moderation/LLM spend → 429 when the user is already out for the day.
    #    The counter only advances on a successful completion (below).
    await enforce_chat_daily_limit(db, user, cost=TURN_CHAT_CREDIT_COST)

    # Capture the bits the post-stream increment needs now, while the request
    # ORM instance is still attached — the increment runs inside the generator,
    # past this request session's lifecycle.
    is_free = user.tier == UserTier.free
    user_id = user.id
    tz_name = user.timezone

    # 3. Deterministic prompt-injection gate on the candidate-authored text
    #    (the typed message plus any attached "Ask about this" snippet). Free /
    #    local, so it runs BEFORE the billed moderation call: an injected tutor
    #    message never reaches OpenAI moderation or OpenRouter, and — unlike
    #    moderation, which only logs an info-level `moderation_request` — a hit
    #    here records an `injection_detected` WARNING (source `tutor.message`).
    #    The delimiters + injection clause in `stream_tutor_reply` are the recall
    #    layer for subtler attempts this high-precision regex skips.
    injection_text = body.message
    if body.context_snippet and body.context_snippet.strip():
        injection_text = f"{injection_text}\n{body.context_snippet}"
    if contains_injection(injection_text):
        logger.info(
            "Tutor message rejected by injection gate session=%s turn=%s",
            session_id,
            turn_id,
        )
        await log_injection_detected(
            source="tutor.message",
            text=injection_text,
            user=user,
            session_id=session_id,
            db=db,
            metadata={"turn_id": str(turn_id)},
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_INJECTION_REFUSAL,
        )

    # 4. Moderate the incoming message before any LLM spend. `flagged` → 422;
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

    # 5. Build the lean context and stream the reply.
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
        # A "completion" is a successful LLM response: stream_tutor_reply emits a
        # `done` event on success and an `error` (with no `done`) on any upstream
        # failure. So we charge a slot iff we reach `done` without having seen an
        # error — the user is never penalized for an OpenRouter/SDK error. The
        # increment fails open: a counter hiccup must not corrupt the stream.
        errored = False
        async for event in stream_tutor_reply(ctx, history, message):
            if event["type"] == "error":
                errored = True
            elif event["type"] == "done" and not errored and is_free:
                try:
                    remaining = await record_chat_completion(
                        user_id, tz_name, cost=TURN_CHAT_CREDIT_COST
                    )
                    event = {**event, "remaining": remaining}
                except Exception:  # noqa: BLE001 — never break the stream on this
                    logger.exception("failed to record tutor chat completion")
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


@router.post("/tutor")
async def ask_tutor_general(
    body: GeneralTutorMessageIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """The general interview coach (`/tutor` page) — no session, no turn.

    Same gate order and same fail-soft streaming contract as the turn-scoped
    route above; the differences are all inside the service, selected by
    `TutorMode.general`. Costs 2 chat credits because it runs a much more
    expensive model with a live-search budget.
    """
    # 1. Chat credits — read-only pre-check BEFORE moderation / LLM spend.
    await enforce_chat_daily_limit(db, user, cost=GENERAL_CHAT_CREDIT_COST)

    # Capture what the post-stream charge needs while the ORM instance is still
    # attached; the increment runs inside the generator, past this session's life.
    is_free = user.tier == UserTier.free
    user_id = user.id
    tz_name = user.timezone

    # 2. Deterministic injection gate on the typed message (free / local, so it
    #    runs before the billed moderation call). No session id to attach here.
    if contains_injection(body.message):
        logger.info("General tutor message rejected by injection gate user=%s", user.id)
        await log_injection_detected(
            source="tutor.message",
            text=body.message,
            user=user,
            db=db,
            metadata={"surface": "general"},
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_INJECTION_REFUSAL,
        )

    # 3. Moderate before the SSE opens, so a block is a normal 422.
    moderation = await check_moderation(
        body.message,
        user=user,
        db=db,
        metadata={"source": "tutor.message", "surface": "general"},
    )
    if moderation.flagged:
        logger.info(
            "General tutor message rejected by moderation user=%s categories=%s",
            user.id,
            moderation.categories,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_MODERATION_REFUSAL,
        )

    # 4. Build the small who-is-this-candidate context and stream.
    ctx = _build_general_context(user)
    history = [{"role": h.role, "content": h.content} for h in body.history]
    message = body.message

    async def event_stream():
        # Charge iff the reply completes: `done` with no prior `error`. An
        # upstream failure yields `error` and no `done`, so it is never billed.
        errored = False
        async for event in stream_tutor_reply(
            ctx, history, message, mode=TutorMode.general
        ):
            if event["type"] == "error":
                errored = True
            elif event["type"] == "done" and not errored and is_free:
                try:
                    remaining = await record_chat_completion(
                        user_id, tz_name, cost=GENERAL_CHAT_CREDIT_COST
                    )
                    event = {**event, "remaining": remaining}
                except Exception:  # noqa: BLE001 — never break the stream on this
                    logger.exception("failed to record general tutor completion")
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
