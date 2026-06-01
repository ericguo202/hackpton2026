"""Wire model for industry and role autocomplete suggestions."""

from __future__ import annotations

from pydantic import BaseModel


class SuggestionsOut(BaseModel):
    """Autocomplete result for an industry or target-role field.

    `suggestions` is the ranked list of up to 5 normalized matches (empty when
    the input is too short, gibberish, moderation-blocked, or the provider is
    unavailable). `flagged` is True only when OpenAI moderation hard-blocked the
    input; `message` carries an optional short user-facing note.
    """

    suggestions: list[str] = []
    flagged: bool = False
    message: str | None = None
