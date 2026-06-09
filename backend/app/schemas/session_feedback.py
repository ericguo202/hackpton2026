"""Pydantic shapes for required beta feedback submissions."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SessionFeedbackCreateIn(BaseModel):
    session_id: UUID
    smoothness_rating: int = Field(ge=1, le=5)
    desired_features: str | None = Field(default=None, max_length=4000)
    question_relevance_rating: int = Field(ge=1, le=5)
    feedback_helpfulness_rating: int = Field(ge=1, le=5)
    feedback_specificity: str | None = Field(default=None, max_length=4000)
    bug_report: str | None = Field(default=None, max_length=4000)
    pay_likelihood_rating: int = Field(ge=1, le=5)
    willing_to_pay: bool
    monthly_price: str | None = Field(default=None, max_length=500)
    paid_feature_request: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _validate_payment_branch(self) -> "SessionFeedbackCreateIn":
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
    session_id: UUID
    smoothness_rating: int
    desired_features: str | None
    question_relevance_rating: int
    feedback_helpfulness_rating: int
    feedback_specificity: str | None
    bug_report: str | None
    pay_likelihood_rating: int
    willing_to_pay: bool
    monthly_price: str | None
    paid_feature_request: str | None
    created_at: datetime
