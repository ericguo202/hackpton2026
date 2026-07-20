"""Tests for `_category_weights` — the Recommended-Mix calibration draw."""

from __future__ import annotations

import random

import pytest

from app.db.models.enums import ExperienceLevel, QuestionCategory
from app.services._category_weights import (
    P_FIRST_MF,
    category_weights,
    draw_opening_category,
)
from app.services._field_categories import FIELD_CATEGORIES

_STAR = QuestionCategory.experience_star
_MF = QuestionCategory.motivation_fit
_SIT = QuestionCategory.situational
_SAG = QuestionCategory.self_assessment_growth

_ALL_LEVELS = list(ExperienceLevel)


# --- category_weights: shape invariants ---------------------------------------


def test_every_vector_sums_to_one_and_is_nonnegative():
    for level in [*_ALL_LEVELS, None]:
        for field in [*FIELD_CATEGORIES, None]:
            w = category_weights(field, level)
            assert set(w.keys()) == {_STAR, _MF, _SIT, _SAG}
            assert all(v >= 0.0 for v in w.values()), (field, level, w)
            assert sum(w.values()) == pytest.approx(1.0), (field, level, w)


def test_none_level_matches_entry_baseline():
    # level None -> entry baseline (field held constant).
    for field in [*FIELD_CATEGORIES, None]:
        assert category_weights(field, None) == category_weights(
            field, ExperienceLevel.entry
        )


def test_none_field_is_pure_baseline():
    # field None -> no industry modifier: matches the documented level baseline.
    baselines = {
        ExperienceLevel.internship: {_STAR: 0.20, _MF: 0.30, _SIT: 0.35, _SAG: 0.15},
        ExperienceLevel.entry: {_STAR: 0.25, _MF: 0.30, _SIT: 0.30, _SAG: 0.15},
        ExperienceLevel.mid: {_STAR: 0.45, _MF: 0.20, _SIT: 0.20, _SAG: 0.15},
        ExperienceLevel.senior: {_STAR: 0.50, _MF: 0.15, _SIT: 0.20, _SAG: 0.15},
        ExperienceLevel.staff: {_STAR: 0.45, _MF: 0.15, _SIT: 0.25, _SAG: 0.15},
        ExperienceLevel.executive: {_STAR: 0.40, _MF: 0.15, _SIT: 0.25, _SAG: 0.20},
    }
    for level, expected in baselines.items():
        w = category_weights(None, level)
        for cat, exp in expected.items():
            assert w[cat] == pytest.approx(exp), (level, cat, w)


# --- category_weights: spec anchors -------------------------------------------


@pytest.mark.parametrize("level", [ExperienceLevel.internship, ExperienceLevel.entry])
def test_healthcare_early_override(level):
    w = category_weights("Healthcare and Life Sciences", level)
    assert 0.45 <= w[_SIT] <= 0.50
    assert w[_MF] == pytest.approx(0.25)
    assert w[_STAR] == pytest.approx(0.15)
    assert 0.10 <= w[_SAG] <= 0.15


def test_government_situational_above_baseline_through_staff():
    for level in (
        ExperienceLevel.internship,
        ExperienceLevel.entry,
        ExperienceLevel.mid,
        ExperienceLevel.senior,
        ExperienceLevel.staff,
    ):
        gov = category_weights("Government and Public Sector", level)
        base = category_weights(None, level)
        assert gov[_SIT] > base[_SIT], level


def test_finance_reduces_situational():
    base = category_weights(None, ExperienceLevel.senior)
    fin = category_weights("Finance, Banking, and Private Capital", ExperienceLevel.senior)
    assert fin[_SIT] < base[_SIT]


def test_retail_early_situational_spike():
    base = category_weights(None, ExperienceLevel.internship)
    retail = category_weights("Retail, Hospitality, and Service", ExperienceLevel.internship)
    assert retail[_SIT] > base[_SIT]


def test_tech_senior_is_star_dominant():
    w = category_weights("Technology, Product, and Design", ExperienceLevel.senior)
    assert max(w, key=w.get) == _STAR


# --- draw_opening_category ----------------------------------------------------


def test_first_opening_multi_turn_is_mostly_mf():
    rng = random.Random(1234)
    draws = [
        draw_opening_category(
            field="Technology, Product, and Design",
            level=ExperienceLevel.senior,
            num_turns=6,
            used=set(),
            is_first_opening=True,
            rng=rng,
        )
        for _ in range(4000)
    ]
    freq = draws.count(_MF) / len(draws)
    # At least the forced-bias share (P_FIRST_MF); the 35% fall-through can add
    # a little more, but a STAR-dominant senior/tech field keeps it modest.
    assert P_FIRST_MF - 0.03 <= freq <= 0.80, freq


def test_two_turn_session_skips_mf_bias():
    # A single-opening (2-turn) session applies the weights immediately, so M&F
    # frequency tracks its (low) weight rather than the 0.65 bias.
    rng = random.Random(99)
    draws = [
        draw_opening_category(
            field="Technology, Product, and Design",
            level=ExperienceLevel.senior,
            num_turns=2,
            used=set(),
            is_first_opening=True,
            rng=rng,
        )
        for _ in range(4000)
    ]
    freq = draws.count(_MF) / len(draws)
    assert freq < 0.35, freq


def test_without_replacement_never_repeats_used():
    rng = random.Random(7)
    used = {_MF, _SIT}
    for _ in range(2000):
        got = draw_opening_category(
            field="Healthcare and Life Sciences",
            level=ExperienceLevel.internship,
            num_turns=6,
            used=used,
            is_first_opening=False,
            rng=rng,
        )
        assert got in (_STAR, _SAG)


def test_all_used_falls_back_to_full_weights():
    # Degenerate guard: if every category is exhausted, still returns a valid one.
    rng = random.Random(3)
    got = draw_opening_category(
        field=None,
        level=ExperienceLevel.mid,
        num_turns=8,
        used={_STAR, _MF, _SIT, _SAG},
        is_first_opening=False,
        rng=rng,
    )
    assert got in (_STAR, _MF, _SIT, _SAG)


def test_first_opening_mf_bias_respects_used():
    # If M&F is already used, the turn-1 bias cannot re-pick it.
    rng = random.Random(11)
    for _ in range(500):
        got = draw_opening_category(
            field=None,
            level=ExperienceLevel.entry,
            num_turns=6,
            used={_MF},
            is_first_opening=True,
            rng=rng,
        )
        assert got != _MF
