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
    `illicit/violence`, `self-harm/instructions`, violence/graphic`,
    `sexual`, `sexual/minors`. These are the categories where a false negative is
    worse than the occasional false positive.
  * Everything else (harassment, self-harm, generic violence)
    is returned as `flagged=False` so legitimate behavioral stories
    ("I mediated a conflict with an aggressive coworker") don't get
    blocked. Callers can inspect `categories` if they want to log or
    soft-warn, but the default is to only gate on the hard-block set.

Failure mode: if the moderation call itself errors (timeout, network,
misconfigured key), we FAIL OPEN — the check returns `flagged=False` and
logs the exception. A demo that hard-fails every turn because of a
moderation outage is worse than one that occasionally slips content the
downstream models would have filtered anyway.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.core.config import settings

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


async def check_moderation(text: str) -> ModerationResult:
    """Run `text` through OpenAI moderation; return a block/allow verdict.

    Empty / whitespace-only input is short-circuited to `_SAFE` — there's
    nothing to moderate and we don't want to burn a network round-trip
    on it. Transport or API errors also fall through to `_SAFE` per the
    fail-open policy documented at the top of this module.
    """
    if not text or not text.strip():
        return _SAFE

    try:
        client = _get_client()
        response = await client.moderations.create(
            model=MODERATION_MODEL,
            input=text,
        )
    except Exception as exc:  # noqa: BLE001
        # Fail open — a broken moderation service must not break the demo.
        # The categories we care most about (hate, sexual/minors) are rare
        # enough that occasional pass-through during an outage is
        # acceptable; we still log loudly so it's visible in the journal.
        logger.warning("Moderation call failed; allowing content: %s", exc)
        return _SAFE

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
    return ModerationResult(flagged=blocking, categories=tripped)
