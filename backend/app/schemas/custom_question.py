"""
Pydantic request / response shapes for `/api/v1/custom-questions`.

A custom question is a candidate-authored interview question (text only). The
create endpoint accepts a batch (single-add sends one element; bulk paste splits
on newlines) and returns a per-question report: which were accepted and which
were rejected (and why), since each is independently screened.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

# Per-question hard cap, mirrored client-side in CustomQuestionsManager.tsx. A
# real behavioral question is comfortably under this; the cap blocks a pasted
# blob that would burn validator tokens.
MAX_QUESTION_CHARS = 300
# Upper bound on how many lines we accept in one request, so a giant paste can't
# fan out into an unbounded number of sequential LLM validator calls.
MAX_BATCH_SIZE = 50


class CustomQuestionCreateIn(BaseModel):
    """Add one or more custom questions.

    `questions` always arrives as a list: the single-add UI sends a 1-element
    list; bulk paste is split on newlines client-side. The server still trims,
    drops blanks, and dedups within the batch. The per-item `MAX_QUESTION_CHARS`
    cap is enforced in the endpoint (an over-long item is reported as `rejected`
    with a reason, not a 422) so one long line can't fail the whole batch.
    """

    questions: list[str] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


class CustomQuestionOut(BaseModel):
    """A persisted custom question row.

    `question_category` is the FORM the screening LLM classified the question as
    (a `QuestionCategory` value). The frontend renders its label beside the text
    and the session-create path uses it to pick the rubric / research variant.
    """

    id: UUID
    question_text: str
    question_category: str
    created_at: datetime


class RejectedQuestion(BaseModel):
    """A question that did not make it in, with a user-facing reason."""

    text: str
    reason: str


class CustomQuestionCreateOut(BaseModel):
    """Per-question report from a (possibly bulk) create call.

    Partial success: `created` holds the rows that passed every gate, `rejected`
    holds the ones blocked (moderation / injection / invalid-or-irrelevant /
    too-long / over the per-user cap). `remaining_slots` is how many more the
    user can add (0-10).
    """

    created: list[CustomQuestionOut]
    rejected: list[RejectedQuestion]
    remaining_slots: int
