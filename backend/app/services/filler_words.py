"""
Filler-word counter — deterministic ground truth for the interview evaluator.

CLAUDE.md L99 declares the filler-word regex is authoritative; any
LLM-supplied breakdown is supplemental. This module owns that regex so the
evaluator layer doesn't drift. Output shape matches the `interview_turns`
columns: `filler_word_count` (INT) and `filler_word_breakdown` (JSONB map).
"""

import re
from collections import Counter

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
