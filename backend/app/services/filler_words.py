"""
Filler-word counter — deterministic ground truth for the interview evaluator.

CLAUDE.md L99 declares the filler-word regex is authoritative; any
LLM-supplied breakdown is supplemental. This module owns that regex so the
evaluator layer doesn't drift. Output shape matches the `interview_turns`
columns: `filler_word_count` (INT) and `filler_word_breakdown` (JSONB map).
"""

import re
from collections import Counter
from decimal import Decimal

# Multi-word phrases come first so the alternation matches the longest
# candidate at a given position ("you know" before "you"/"know"; "i mean"
# before "i"/"mean"). Word boundaries guard against substring matches
# ("umbrella" must NOT hit "um").
_FILLER_TERMS = (
    "you know",
    "i mean",
    "kind of",
    "sort of",
    "um",
    "uh",
    "er",
    "like",
    "basically",
    "literally",
    "actually",
    "right",
)

_FILLER_RE = re.compile(
    r"\b(" + "|".join(re.escape(term) for term in _FILLER_TERMS) + r")\b",
    re.IGNORECASE,
)


def count_filler_words(transcript: str) -> tuple[int, dict[str, int]]:
    """Return (total_count, {word: count, ...}) for filler words in `transcript`.

    Breakdown keys are the canonical lowercase form from `_FILLER_TERMS`.
    Words that never appear are omitted (absent = 0), which matches the
    default `{}::jsonb` stored in `interview_turns.filler_word_breakdown`.
    """
    matches = [m.group(0).lower() for m in _FILLER_RE.finditer(transcript)]
    breakdown = dict(Counter(matches))
    return sum(breakdown.values()), breakdown


def count_words(transcript: str) -> int:
    """Return the total word count of `transcript` (whitespace tokenization).

    This is the DENOMINATOR for filler-word rate. We deliberately count
    whitespace-separated tokens (`str.split()`), NOT filler-regex matches —
    so a multi-word filler like "you know" is 1 filler but 2 words. The rate
    (`filler / words`) is therefore slightly conservative, which is fine for a
    coaching metric. The Alembic backfill mirrors this with
    `array_length(regexp_split_to_array(btrim(transcript), '\\s+'), 1)`.
    """
    if not transcript:
        return 0
    return len(transcript.split())


def filler_rate_pct(filler_count: int | None, word_count: int | None) -> Decimal | None:
    """Filler words as a percent of total words, 1 decimal. None when no words.

    Returned as `Decimal` so it serializes to a JSON string on the wire,
    matching the other Decimal aggregates the history page already coerces
    via its `num()` helper. `None` (empty transcript / legacy row with no
    word total) is rendered as an em-dash by the frontend, never 0%.
    """
    if not word_count:  # None or 0 → undefined rate
        return None
    return Decimal(str(round((filler_count or 0) / word_count * 100, 1)))
