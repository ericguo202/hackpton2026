"""
Filler-word counter + speaking-pace math — deterministic ground truth for the
interview evaluator.

CLAUDE.md L99 declares the filler-word regex is authoritative; any
LLM-supplied breakdown is supplemental. This module owns that regex so the
evaluator layer doesn't drift. Output shape matches the `interview_turns`
columns: `filler_word_count` (INT) and `filler_word_breakdown` (JSONB map).

It also owns `speaking_pace_wpm`, the second transcript-derived delivery metric
(words per minute), and `strip_audio_events` — the counting-only scrub that
keeps ElevenLabs audio-event tags out of BOTH denominators.
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

# ElevenLabs STT sends `tag_audio_events=true` by default, so a transcript can
# come back as "So (laughter) basically I led the migration" — parenthesized
# (or bracketed) NON-SPEECH markers: (laughter), (music), (foreign), [applause].
#
# We deliberately KEEP those tags in `interview_turns.transcript_text`: the
# evaluator should notice that laughing/singing/yelling is unprofessional, and
# the candidate should see what they actually said. But a tag is not a spoken
# word, so it must not inflate the word count (the denominator for BOTH the
# filler rate and words-per-minute) or register as a filler ("(right)").
#
# Hence this scrub is COUNTING-ONLY — never persisted, never displayed, never
# sent to any LLM. The 40-char inner bound keeps an unbalanced paren in real
# speech from swallowing the rest of the transcript; `\n` is excluded for the
# same reason.
_AUDIO_EVENT_RE = re.compile(r"[(\[][^)\]\n]{0,40}[)\]]")

# Below this many spoken words, words-per-minute is noise rather than pacing:
# a four-word non-answer in nine seconds reads as 27 wpm ("far too slow") when
# the real problem is that it isn't an answer. Matches the evaluator's existing
# "<25 words" non-answer threshold in `_calibrate_content_scores`.
MIN_WORDS_FOR_PACE = 25


def strip_audio_events(transcript: str) -> str:
    """Drop ElevenLabs audio-event tags, for COUNTING ONLY.

    See `_AUDIO_EVENT_RE`. Tags are replaced with a space (not "") so
    "word(laughter)word" can't fuse into one token, then whitespace collapses.
    The stored transcript keeps its tags — only `count_words` /
    `count_filler_words` see the scrubbed text.
    """
    if not transcript:
        return ""
    return " ".join(_AUDIO_EVENT_RE.sub(" ", transcript).split())


def count_filler_words(transcript: str) -> tuple[int, dict[str, int]]:
    """Return (total_count, {word: count, ...}) for filler words in `transcript`.

    Breakdown keys are the canonical lowercase form from `_FILLER_TERMS`.
    Words that never appear are omitted (absent = 0), which matches the
    default `{}::jsonb` stored in `interview_turns.filler_word_breakdown`.

    Audio-event tags are scrubbed first, so a tag like "(right)" or "(you
    know)" never counts as a filler the candidate actually said.
    """
    cleaned = strip_audio_events(transcript)
    matches = [m.group(0).lower() for m in _FILLER_RE.finditer(cleaned)]
    breakdown = dict(Counter(matches))
    return sum(breakdown.values()), breakdown


def count_words(transcript: str) -> int:
    """Return the total spoken word count of `transcript`.

    This is the DENOMINATOR for both the filler-word rate and words-per-minute.
    Audio-event tags are scrubbed first (see `strip_audio_events`); the
    remainder is whitespace-tokenized (`str.split()`), NOT filler-regex
    matched — so a multi-word filler like "you know" is 1 filler but 2 words.
    The filler rate is therefore slightly conservative, which is fine for a
    coaching metric.

    NOTE: the `0011_word_counts` Alembic backfill
    (`array_length(regexp_split_to_array(btrim(transcript), '\\s+'), 1)`) has
    no scrub, so rows backfilled before this scrub existed still count tags.
    Tags are rare enough that we deliberately did NOT re-backfill.
    """
    if not transcript:
        return 0
    return len(strip_audio_events(transcript).split())


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


def speaking_pace_wpm(
    word_count: int | None,
    duration_seconds: float | Decimal | None,
) -> int | None:
    """Speaking pace in words per minute, or None when it isn't meaningful.

    `duration_seconds` is the SPEECH SPAN from ElevenLabs word timestamps
    (first word's start → last word's end), not the wall-clock length of the
    recording — so the silence before the candidate starts and the dead air
    before they stop recording don't drag a well-paced answer into the red.

    Returns None (rendered as an em-dash, never a fake 0 — same contract as
    `filler_rate_pct`) when:
      - the duration is missing or non-positive (legacy rows have no
        measurement at all, which is why the column is nullable), or
      - the answer is shorter than `MIN_WORDS_FOR_PACE`.

    Reference bands the UI colors against: <120 too slow, 120-160 on target,
    160-175 slightly fast, >175 too fast.
    """
    if not word_count or word_count < MIN_WORDS_FOR_PACE:
        return None
    if duration_seconds is None:
        return None
    seconds = float(duration_seconds)
    if seconds <= 0:
        return None
    return round(word_count / (seconds / 60))
