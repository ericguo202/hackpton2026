"""Required beta feedback submissions for completed sessions."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.enums import SessionStatus
from app.db.models.interview_session import InterviewSession
from app.db.models.session_feedback import SessionFeedback
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.session_feedback import (
    SessionFeedbackCreateIn,
    SessionFeedbackOut,
)

router = APIRouter()


@router.post("", response_model=SessionFeedbackOut, status_code=status.HTTP_201_CREATED)
async def create_session_feedback(
    body: SessionFeedbackCreateIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionFeedback:
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
        feedback_specificity_response=_clean_optional(
            body.feedback_specificity_response
        ),
        bug_report=_clean_optional(body.bug_report),
        pay_likelihood_response=body.pay_likelihood_response.strip(),
        overall_satisfaction_rating=body.overall_satisfaction_rating,
        ease_of_use_rating=body.ease_of_use_rating,
        question_quality_rating=body.question_quality_rating,
        feedback_actionability_rating=body.feedback_actionability_rating,
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


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None
