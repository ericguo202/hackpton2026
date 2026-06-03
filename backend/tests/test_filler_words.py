from decimal import Decimal

from app.services.filler_words import (
    count_filler_words,
    count_words,
    filler_rate_pct,
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
