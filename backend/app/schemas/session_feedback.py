"""Pydantic shapes for required beta feedback submissions."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SessionFeedbackCreateIn(BaseModel):
    # None for voluntary feedback submitted via the floating launcher (not tied
    # to a session); the compulsory gate sends the latest completed session id.
    session_id: UUID | None = None
    smoothness_rating: int = Field(ge=1, le=5)
    desired_features: str | None = Field(default=None, max_length=4000)
    difficult_feature_response: str | None = Field(default=None, max_length=4000)
    question_relevance_response: str = Field(min_length=1, max_length=4000)
    feedback_helpfulness_response: str = Field(min_length=1, max_length=4000)
    bug_report: str | None = Field(default=None, max_length=4000)
    overall_satisfaction_rating: int = Field(ge=1, le=5)
    question_quality_rating: int = Field(ge=1, le=5)
    would_recommend_rating: int = Field(ge=1, le=5)
    willing_to_pay: bool
    monthly_price: str | None = Field(default=None, max_length=500)
    paid_feature_request: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _validate_payment_branch(self) -> "SessionFeedbackCreateIn":
        required_text = {
            "question_relevance_response": self.question_relevance_response,
            "feedback_helpfulness_response": self.feedback_helpfulness_response,
        }
        for field_name, value in required_text.items():
            if not value.strip():
                raise ValueError(f"{field_name} is required")

        monthly_price = (self.monthly_price or "").strip()
        paid_feature_request = (self.paid_feature_request or "").strip()
        if self.willing_to_pay and not monthly_price:
            raise ValueError("monthly_price is required when willing_to_pay is true")
        if not self.willing_to_pay and not paid_feature_request:
            raise ValueError(
                "paid_feature_request is required when willing_to_pay is false"
            )
        return self


class SessionFeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    session_id: UUID | None
    smoothness_rating: int
    desired_features: str | None
    difficult_feature_response: str | None
    question_relevance_response: str
    feedback_helpfulness_response: str
    bug_report: str | None
    overall_satisfaction_rating: int
    question_quality_rating: int
    would_recommend_rating: int
    willing_to_pay: bool
    monthly_price: str | None
    paid_feature_request: str | None
    created_at: datetime


class FeedbackRequiredOut(BaseModel):
    """Gate status for the forced beta-feedback modal.

    `session_id` is the completed session the forced submission attaches to;
    null when feedback isn't required.
    """

    required: bool
    session_id: UUID | None = None
