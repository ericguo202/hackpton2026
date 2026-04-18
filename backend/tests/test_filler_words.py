from app.services.filler_words import count_filler_words


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
