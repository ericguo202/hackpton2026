"""
Custom-questions endpoints — candidate-authored interview questions.

GET    /api/v1/custom-questions        — list the caller's custom questions
POST   /api/v1/custom-questions        — add one or more (bulk), with screening
DELETE /api/v1/custom-questions/{id}   — delete one (frees a slot)

Each submitted question is screened in the house free->billed order before it
is stored:
  1. deterministic injection regex (free / local) — hit logs an incident + reject
  2. OpenAI moderation (billed)   — flagged → reject; outage → 503 (fail-closed)
  3. LLM validity / relevance     — invalid or off-domain → reject (fails open)

Gate 3 also CLASSIFIES the question into one of the four `QuestionCategory`
types, which is persisted on the row so practicing it uses the right rubric,
follow-up prompts, and research variant.

Bulk pastes are screened SEQUENTIALLY (the validator is a free-tier model and
parallel calls trip its rate limit). The endpoint is partial-success: clean
questions are inserted and committed; blocked ones come back in `rejected` with
a reason. A per-user cap of 10 (any tier) is enforced up front; deleting frees
a slot.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.custom_question import CustomQuestion
from app.db.models.enums import QuestionCategory
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.custom_question import (
    MAX_QUESTION_CHARS,
    CustomQuestionCreateIn,
    CustomQuestionCreateOut,
    CustomQuestionOut,
    RejectedQuestion,
)
from app.services._injection import contains_injection
from app.services.custom_questions import validate_custom_question
from app.services.incidents import log_injection_detected
from app.services.moderation import check_moderation

logger = logging.getLogger(__name__)

router = APIRouter()

# Hard cap on stored custom questions per user (any tier). Deleting frees a
# slot. Server-enforced so a direct-API caller can't exceed it.
CUSTOM_QUESTION_CAP = 10

# User-facing rejection reasons (kept short — the frontend renders them inline
# next to the offending line).
_REASON_TOO_LONG = f"Too long — keep it under {MAX_QUESTION_CHARS} characters."
_REASON_INJECTION = "Looks like it contains instructions to the AI, not an interview question."
_REASON_MODERATION = "Flagged by our content policy."
_REASON_CAP = f"You can store up to {CUSTOM_QUESTION_CAP} custom questions. Delete one to add more."


async def _screen_one(
    text: str, user: User, db: AsyncSession
) -> tuple[str | None, QuestionCategory]:
    """Run the three gates on one question.

    Returns `(rejection_reason, category)` — the reason is None when the
    question is clean. The category is only meaningful for a clean question
    (gate 3 is what classifies it); the gates that reject before it runs return
    the STAR default, which is never persisted. Raises
    `ModerationUnavailableError` (→ 503) on a moderation outage, which aborts
    the whole request before any insert.
    """
    # 1. Free / local injection regex. Strict-long: a custom question is medium
    #    prose where prompt-hardening vocabulary is not legitimate.
    if contains_injection(text, strict=True, short_field=False):
        await log_injection_detected(
            source="custom_questions.question_text",
            text=text,
            user=user,
            db=db,
        )
        return _REASON_INJECTION, QuestionCategory.experience_star

    # 2. Billed moderation. flagged → reject; outage raises → 503 (fail-closed).
    moderation = await check_moderation(
        text, user=user, db=db, metadata={"source": "custom_questions"}
    )
    if moderation.flagged:
        return _REASON_MODERATION, QuestionCategory.experience_star

    # 3. LLM validity / relevance check + question-type classification (fails
    #    open on both axes — `ok=True`, `category=experience_star`).
    check = await validate_custom_question(
        question_text=text,
        target_role=user.target_role,
        industry=user.industry,
    )
    if not check.ok:
        return (
            check.reason or "Not a valid or relevant interview question.",
            check.category,
        )

    return None, check.category


async def _count_existing(db: AsyncSession, user: User) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(CustomQuestion)
        .where(CustomQuestion.user_id == user.id)
    )
    return result.scalar_one() or 0


# ── list ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CustomQuestionOut])
async def list_custom_questions(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> list[CustomQuestionOut]:
    """The caller's custom questions, newest-first."""
    result = await db.execute(
        select(CustomQuestion)
        .where(CustomQuestion.user_id == user.id)
        .order_by(CustomQuestion.created_at.desc())
    )
    return [
        CustomQuestionOut(
            id=q.id,
            question_text=q.question_text,
            question_category=q.question_category.value,
            created_at=q.created_at,
        )
        for q in result.scalars().all()
    ]


# ── create (single or bulk) ───────────────────────────────────────────────

@router.post("", response_model=CustomQuestionCreateOut, status_code=status.HTTP_201_CREATED)
async def create_custom_questions(
    body: CustomQuestionCreateIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> CustomQuestionCreateOut:
    # Normalize: trim, drop blanks, dedup within the batch (preserve order).
    seen: set[str] = set()
    candidates: list[str] = []
    for raw in body.questions:
        text = raw.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        candidates.append(text)

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No questions to add.",
        )

    existing = await _count_existing(db, user)
    free_slots = max(0, CUSTOM_QUESTION_CAP - existing)

    created: list[CustomQuestionOut] = []
    rejected: list[RejectedQuestion] = []
    accepted_rows: list[CustomQuestion] = []

    for text in candidates:
        # Cheapest local check first: length cap (mirrors client-side).
        if len(text) > MAX_QUESTION_CHARS:
            rejected.append(RejectedQuestion(text=text, reason=_REASON_TOO_LONG))
            continue
        # Cap: stop accepting once the user's remaining slots are spoken for by
        # rows accepted so far in this batch.
        if len(accepted_rows) >= free_slots:
            rejected.append(RejectedQuestion(text=text, reason=_REASON_CAP))
            continue
        # Screen sequentially (don't parallelize the validator).
        reason, category = await _screen_one(text, user, db)
        if reason is not None:
            rejected.append(RejectedQuestion(text=text, reason=reason))
            continue
        row = CustomQuestion(
            user_id=user.id, question_text=text, question_category=category
        )
        db.add(row)
        accepted_rows.append(row)

    if accepted_rows:
        await db.commit()
        for row in accepted_rows:
            await db.refresh(row)
            created.append(
                CustomQuestionOut(
                    id=row.id,
                    question_text=row.question_text,
                    question_category=row.question_category.value,
                    created_at=row.created_at,
                )
            )

    remaining = max(0, CUSTOM_QUESTION_CAP - (existing + len(created)))
    return CustomQuestionCreateOut(
        created=created, rejected=rejected, remaining_slots=remaining
    )


# ── delete ─────────────────────────────────────────────────────────────────

@router.delete("/{custom_question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_question(
    custom_question_id: UUID,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> None:
    cq = await db.get(CustomQuestion, custom_question_id)
    if cq is None or cq.user_id != user.id:
        raise HTTPException(status_code=404, detail="Custom question not found")
    await db.execute(
        sql_delete(CustomQuestion).where(CustomQuestion.id == custom_question_id)
    )
    await db.commit()
