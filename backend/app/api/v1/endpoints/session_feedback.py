"""Required beta feedback submissions for completed sessions."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.enums import SessionStatus
from app.db.models.interview_session import InterviewSession
from app.db.models.session_feedback import SessionFeedback
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session_feedback import (
    FeedbackRequiredOut,
    SessionFeedbackCreateIn,
    SessionFeedbackOut,
)

router = APIRouter()

# Once a user crosses this many lifetime completed sessions and still hasn't
# submitted beta feedback, the frontend forces the feedback modal on the main
# authenticated routes. A `session_feedback` row existing for the user is the
# sole "survey done" signal (the forced modal is the only producer of rows).
BETA_FEEDBACK_SESSION_THRESHOLD = 3


@router.post("", response_model=SessionFeedbackOut, status_code=status.HTTP_201_CREATED)
async def create_session_feedback(
    body: SessionFeedbackCreateIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionFeedback:
    # Voluntary feedback (launcher) carries no session_id and skips the session
    # checks — it accumulates as a standalone, repeatable row. The compulsory
    # gate sends a session_id and goes through ownership / completed / one-per-
    # session validation below.
    if body.session_id is not None:
        session = await db.scalar(
            select(InterviewSession).where(
                InterviewSession.id == body.session_id,
                InterviewSession.user_id == user.id,
            )
        )
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        if session.status != SessionStatus.completed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Feedback can only be submitted for completed sessions.",
            )

        existing_id = await db.scalar(
            select(SessionFeedback.id).where(
                SessionFeedback.session_id == body.session_id,
            )
        )
        if existing_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Feedback has already been submitted for this session.",
            )

    feedback = SessionFeedback(
        user_id=user.id,
        session_id=body.session_id,
        smoothness_response=body.smoothness_response.strip(),
        desired_features=_clean_optional(body.desired_features),
        question_relevance_response=body.question_relevance_response.strip(),
        feedback_helpfulness_response=body.feedback_helpfulness_response.strip(),
        bug_report=_clean_optional(body.bug_report),
        overall_satisfaction_rating=body.overall_satisfaction_rating,
        ease_of_use_rating=body.ease_of_use_rating,
        question_quality_rating=body.question_quality_rating,
        would_recommend_rating=body.would_recommend_rating,
        willing_to_pay=body.willing_to_pay,
        monthly_price=(
            _clean_optional(body.monthly_price) if body.willing_to_pay else None
        ),
        paid_feature_request=(
            _clean_optional(body.paid_feature_request)
            if not body.willing_to_pay
            else None
        ),
    )
    db.add(feedback)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback has already been submitted for this session.",
        ) from exc
    await db.refresh(feedback)
    return feedback


@router.get("/required", response_model=FeedbackRequiredOut)
async def get_feedback_required(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> FeedbackRequiredOut:
    """Whether the caller must submit beta feedback before proceeding.

    Required once the user has crossed BETA_FEEDBACK_SESSION_THRESHOLD lifetime
    completed sessions and has no `session_feedback` row yet. The returned
    `session_id` is the most-recent completed session — the forced submission
    attaches to it (the table keeps its NOT-NULL UNIQUE `session_id`; a row
    existing already short-circuits this to `required=False`, so there's no
    UNIQUE collision). Read-only; the frontend polls it on navigation.
    """
    completed = await db.scalar(
        select(func.count(InterviewSession.id)).where(
            InterviewSession.user_id == user.id,
            InterviewSession.status == SessionStatus.completed,
        )
    )
    if (completed or 0) < BETA_FEEDBACK_SESSION_THRESHOLD:
        return FeedbackRequiredOut(required=False, session_id=None)

    already = await db.scalar(
        select(SessionFeedback.id).where(SessionFeedback.user_id == user.id)
    )
    if already is not None:
        return FeedbackRequiredOut(required=False, session_id=None)

    latest_id = await db.scalar(
        select(InterviewSession.id)
        .where(
            InterviewSession.user_id == user.id,
            InterviewSession.status == SessionStatus.completed,
        )
        .order_by(InterviewSession.created_at.desc())
        .limit(1)
    )
    return FeedbackRequiredOut(required=latest_id is not None, session_id=latest_id)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None
