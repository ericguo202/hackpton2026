"""Pydantic shapes for required beta feedback submissions."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SessionFeedbackCreateIn(BaseModel):
    session_id: UUID
    smoothness_response: str = Field(min_length=1, max_length=4000)
    desired_features: str | None = Field(default=None, max_length=4000)
    question_relevance_response: str = Field(min_length=1, max_length=4000)
    feedback_helpfulness_response: str = Field(min_length=1, max_length=4000)
    feedback_specificity_response: str | None = Field(default=None, max_length=4000)
    bug_report: str | None = Field(default=None, max_length=4000)
    pay_likelihood_response: str = Field(min_length=1, max_length=4000)
    overall_satisfaction_rating: int = Field(ge=1, le=5)
    ease_of_use_rating: int = Field(ge=1, le=5)
    question_quality_rating: int = Field(ge=1, le=5)
    feedback_actionability_rating: int = Field(ge=1, le=5)
    would_recommend_rating: int = Field(ge=1, le=5)
    willing_to_pay: bool
    monthly_price: str | None = Field(default=None, max_length=500)
    paid_feature_request: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _validate_payment_branch(self) -> "SessionFeedbackCreateIn":
        required_text = {
            "smoothness_response": self.smoothness_response,
            "question_relevance_response": self.question_relevance_response,
            "feedback_helpfulness_response": self.feedback_helpfulness_response,
            "pay_likelihood_response": self.pay_likelihood_response,
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
    session_id: UUID
    smoothness_response: str
    desired_features: str | None
    question_relevance_response: str
    feedback_helpfulness_response: str
    feedback_specificity_response: str | None
    bug_report: str | None
    pay_likelihood_response: str
    overall_satisfaction_rating: int
    ease_of_use_rating: int
    question_quality_rating: int
    feedback_actionability_rating: int
    would_recommend_rating: int
    willing_to_pay: bool
    monthly_price: str | None
    paid_feature_request: str | None
    created_at: datetime
