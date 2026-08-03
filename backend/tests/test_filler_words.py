from decimal import Decimal

from app.services.filler_words import (
    MIN_WORDS_FOR_PACE,
    count_filler_words,
    count_words,
    filler_rate_pct,
    speaking_pace_wpm,
    strip_audio_events,
)


def test_three_ums():
    total, breakdown = count_filler_words(
        "So, um, I worked on the project. Um, it was hard. Um, yeah."
    )
    assert total == 3
    assert breakdown == {"um": 3}


def test_mixed_fillers():
    total, breakdown = count_filler_words(
        "Like, you know, I basically just, like, did the thing."
    )
    assert breakdown == {"like": 2, "you know": 1, "basically": 1}
    assert total == 4


def test_case_insensitive():
    total, breakdown = count_filler_words("Um, UH, Like.")
    assert total == 3
    assert breakdown == {"um": 1, "uh": 1, "like": 1}


def test_word_boundary_no_substring_match():
    # "umbrella" must NOT count as "um"; "likewise" must NOT count as "like".
    total, breakdown = count_filler_words(
        "I grabbed my umbrella and likewise my coat."
    )
    assert total == 0
    assert breakdown == {}


def test_empty_string():
    assert count_filler_words("") == (0, {})


def test_multi_word_phrases_preferred():
    # "you know" should register as the phrase, not collapse to separate hits.
    total, breakdown = count_filler_words("You know, I mean, it works.")
    assert breakdown == {"you know": 1, "i mean": 1}
    assert total == 2


def test_count_words_whitespace_tokenization():
    # Whitespace runs collapse; leading/trailing space ignored — matches the
    # SQL backfill (regexp_split_to_array(btrim(x), '\\s+')).
    assert count_words("um I think you know it works") == 7
    assert count_words("   spaced   out  words ") == 3
    assert count_words("single") == 1
    assert count_words("") == 0


def test_filler_rate_pct():
    # 3 fillers / 80 words = 3.75% -> 3.8 (rounded to 1 dp).
    assert filler_rate_pct(3, 80) == Decimal("3.8")
    # No words -> undefined rate (None), never a divide-by-zero or 0%.
    assert filler_rate_pct(0, 0) is None
    assert filler_rate_pct(5, 0) is None
    assert filler_rate_pct(None, 0) is None
    # Zero fillers over real words is a legitimate 0.0%.
    assert filler_rate_pct(0, 100) == Decimal("0.0")
    # None filler count coerces to 0.
    assert filler_rate_pct(None, 50) == Decimal("0.0")


# ---------------------------------------------------------------------------
# Audio-event scrub (counting-only — the stored transcript keeps its tags)
# ---------------------------------------------------------------------------


def test_strip_audio_events_removes_parenthesized_and_bracketed_tags():
    assert (
        strip_audio_events("So (laughter) basically I led [music] the migration")
        == "So basically I led the migration"
    )
    # ElevenLabs also emits (foreign) for non-English speech.
    assert strip_audio_events("I said (foreign) to the team") == "I said to the team"


def test_strip_audio_events_does_not_fuse_adjacent_words():
    # Tags become a space, not "", so neighbours can't merge into one token.
    assert strip_audio_events("word(laughter)word") == "word word"


def test_strip_audio_events_leaves_unbalanced_paren_alone():
    # A stray opening paren must not swallow the rest of the transcript.
    text = "I thought (about it for a long while and then I acted"
    assert strip_audio_events(text) == text


def test_strip_audio_events_leaves_overlong_parenthetical_alone():
    # Bounded to 40 inner chars, so real prose in parentheses survives — only
    # short non-speech markers are treated as tags.
    long_aside = "(" + "x" * 60 + ")"
    assert strip_audio_events(f"before {long_aside} after") == f"before {long_aside} after"


def test_strip_audio_events_empty():
    assert strip_audio_events("") == ""


def test_count_words_excludes_audio_event_tags():
    # "(laughter)" is not a spoken word — it must not inflate the denominator
    # for either the filler rate or words-per-minute.
    assert count_words("So (laughter) basically I led the migration") == 6
    assert count_words("(music)") == 0


def test_count_filler_words_ignores_fillers_inside_tags():
    # A tag that happens to contain a filler term ("(right)") isn't something
    # the candidate said — but a real filler in the same sentence still counts.
    total, breakdown = count_filler_words("So (right) basically I led the migration")
    assert breakdown == {"basically": 1}
    assert total == 1


# ---------------------------------------------------------------------------
# Speaking pace
# ---------------------------------------------------------------------------


def test_speaking_pace_wpm_basic():
    # 150 words over 60 s of speech = 150 wpm.
    assert speaking_pace_wpm(150, 60.0) == 150
    # 75 words over 30 s = 150 wpm; rounds to a whole number.
    assert speaking_pace_wpm(75, 30.0) == 150
    assert speaking_pace_wpm(100, 45.0) == 133  # 133.33 -> 133


def test_speaking_pace_wpm_none_without_duration():
    # Legacy rows have no measured span — pace is unknown, never 0.
    assert speaking_pace_wpm(150, None) is None
    assert speaking_pace_wpm(150, 0) is None
    assert speaking_pace_wpm(150, -3.0) is None


def test_speaking_pace_wpm_short_answer_floor():
    # Below the floor, wpm is noise rather than pacing (a four-word non-answer
    # in nine seconds would read as a deep-red 27 wpm).
    assert speaking_pace_wpm(MIN_WORDS_FOR_PACE - 1, 30.0) is None
    assert speaking_pace_wpm(0, 30.0) is None
    assert speaking_pace_wpm(None, 30.0) is None
    # Exactly at the floor is allowed.
    assert speaking_pace_wpm(MIN_WORDS_FOR_PACE, 30.0) == 50


def test_speaking_pace_wpm_accepts_decimal_duration():
    # The DB column is NUMERIC, so callers hand us a Decimal.
    assert speaking_pace_wpm(150, Decimal("60.00")) == 150
