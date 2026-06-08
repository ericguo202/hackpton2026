"""
Content moderation via OpenAI's `omni-moderation-latest`.

Acts as a pre-check on user-supplied text before it reaches the billed LLM
calls (evaluator / follow-up / opening question / company research). Purpose
is ToS compliance — a user who rants something racist / violent / sexual
into the microphone shouldn't cause OpenRouter or downstream model
providers to flag our key for abusive traffic.

The moderation API is hit directly at `https://api.openai.com/v1/moderations`,
NOT through OpenRouter — OpenRouter exposes chat completions, not the
purpose-built moderation endpoint. It's free and only needs an OpenAI API
key (no billing plan required).

Policy:
  * Hard-block on `harassment/threatening`, `hate`, `hate/threatening`, 
    `illicit/violence`, `self-harm/instructions`, `violence/graphic`,
    `sexual`, `sexual/minors`. These are the categories where a false negative is
    worse than the occasional false positive.
  * Everything else (harassment, self-harm, generic violence)
    is returned as `flagged=False` so legitimate behavioral stories
    ("I mediated a conflict with an aggressive coworker") don't get
    blocked. Callers can inspect `categories` if they want to log or
    soft-warn, but the default is to only gate on the hard-block set.

Failure mode: moderation is a critical security step, so it FAILS CLOSED.
If the moderation call itself errors (timeout, network, misconfigured key),
`check_moderation` raises `ModerationUnavailableError` rather than returning a
permissive verdict — content must never slip through unchecked just because the
service is down. The error is also surfaced as an `error`-severity incident
(`log_error`) so an outage is visible/alertable, not just logged. Endpoint
callers map this to a 503 (via the handler in `main.py`); the autocomplete path
catches it and fails soft to an empty suggestion list (no unmoderated input
reaches the billed LLM). A missing `OPENAI_API_KEY` is caught even earlier:
`ensure_moderation_configured()` runs at app startup and refuses to boot, so
production can never run with the content-policy layer silently disabled.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.incidents import (
    SEVERITY_INFO,
    SEVERITY_WARNING,
    log_error,
    log_moderation_request,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.models.user import User

logger = logging.getLogger(__name__)

OPENAI_BASE_URL = "https://api.openai.com/v1"
MODERATION_MODEL = "omni-moderation-latest"

# Categories that hard-block. Anything outside this set is advisory only —
# reported in `categories` on the result but does not set `flagged`.
_HARD_BLOCK_CATEGORIES = frozenset({
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "illicit/violent",
    "self-harm/instructions",
    "violence/graphic",
    "sexual",
    "sexual/minors",
})

_client: AsyncOpenAI | None = None


class ModerationUnavailableError(Exception):
    """Raised when a moderation verdict cannot be produced.

    Covers a missing `OPENAI_API_KEY` (no client) and any transport/API error
    from the moderation endpoint. Failing closed: callers must NOT treat this as
    "allowed" — endpoints surface it as a 503, autocomplete falls back to no
    suggestions.
    """


def ensure_moderation_configured() -> None:
    """Fail closed at boot if moderation can't run.

    Called from the app lifespan so production refuses to start when
    `OPENAI_API_KEY` is unset, instead of silently disabling the content-policy
    layer. Constructing the client here also warms the process-wide singleton.
    """
    try:
        _get_client()
    except RuntimeError as exc:
        raise RuntimeError(
            f"Refusing to start: content moderation is not configured. {exc}"
        ) from exc


def _get_client() -> AsyncOpenAI:
    """Return a process-wide `AsyncOpenAI` client pointed at OpenAI direct.

    Separate from `_openrouter.get_client()` because moderation uses a
    different base URL and a different API key (OpenAI's moderation
    endpoint isn't available through OpenRouter).
    """
    global _client
    if _client is not None:
        return _client
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to backend/.env to enable "
            "content moderation on user-supplied text."
        )
    _client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=OPENAI_BASE_URL,
    )
    return _client


@dataclass(frozen=True)
class ModerationResult:
    """Outcome of a moderation pre-check.

    `flagged` is only true when at least one category in
    `_HARD_BLOCK_CATEGORIES` tripped. `categories` lists every category
    the upstream call returned true for (hard-block or not) so callers
    can log / surface them for debugging.
    """
    flagged: bool
    categories: tuple[str, ...]


_SAFE = ModerationResult(flagged=False, categories=())


async def check_moderation(
    text: str,
    *,
    user: "User | None" = None,
    db: "AsyncSession | None" = None,
    session_id: UUID | None = None,
    metadata: dict | None = None,
) -> ModerationResult:
    """Run `text` through OpenAI moderation; return a block/allow verdict.

    Empty / whitespace-only input is short-circuited to `_SAFE` — there's
    nothing to moderate and we don't want to burn a network round-trip
    on it. Transport or API errors (including a missing API key) FAIL CLOSED:
    they raise `ModerationUnavailableError` and emit an `error`-severity
    incident, per the policy documented at the top of this module.
    """
    if not text or not text.strip():
        return _SAFE

    try:
        client = _get_client()
        response = await client.moderations.create(
            model=MODERATION_MODEL,
            input=text,
        )
    except Exception as exc:
        # Fail CLOSED — a broken moderation service must not silently let
        # content through. Surface the outage as an error incident (the
        # alertable channel) and raise so the caller blocks (503) or, for
        # autocomplete, falls back to no suggestions.
        logger.error("Moderation call failed; blocking content: %s", exc)
        await log_error(
            exc,
            user=user,
            db=db,
            metadata={
                **(dict(metadata) if metadata else {}),
                # Unambiguous tag for filtering moderation outages in the
                # incident stream; `source` (from the caller) keeps the field
                # origin (turn.transcript / sessions.company / onboarding.*).
                "subsystem": "moderation",
                "model": MODERATION_MODEL,
            },
        )
        raise ModerationUnavailableError(
            "Content moderation is temporarily unavailable."
        ) from exc

    result = response.results[0]
    # The OpenAI SDK models `categories` as a pydantic object with one bool
    # attr per category (e.g. `result.categories.hate`). Iterate via dict
    # dump so we don't hard-code the attribute list — if OpenAI adds a new
    # category, it flows through automatically.
    category_map = result.categories.model_dump()
    tripped = tuple(
        name for name, hit in category_map.items() if hit
    )
    blocking = any(
        name in _HARD_BLOCK_CATEGORIES for name in tripped
    )
    await log_moderation_request(
        text=text,
        returned_content={
            "provider": "openai",
            "model": MODERATION_MODEL,
            "flagged": blocking,
            "categories": list(tripped),
            "category_map": category_map,
            "hard_block_categories": sorted(_HARD_BLOCK_CATEGORIES),
        },
        user=user,
        db=db,
        session_id=session_id,
        severity=SEVERITY_WARNING if blocking else SEVERITY_INFO,
        metadata=metadata,
    )
    return ModerationResult(flagged=blocking, categories=tripped)
