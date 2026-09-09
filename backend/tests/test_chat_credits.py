"""
Unit tests for the Ask Tutor chat-CREDIT budget.

`users.daily_chat_count` used to count messages (10/day). It now counts credits
(20/day), because the two tutor surfaces cost wildly different amounts: a
turn-scoped chat is 1 credit, a general-coach chat is 2. The behavior that
matters, and that a plain "is the counter at the cap" check would get wrong:
with 1 credit left a turn chat still goes through and a general chat does not.

Driven directly with stubbed deps, matching the style of `test_usage_limits.py`.
"""

import pytest
from fastapi import HTTPException

from app.db.models.enums import UserTier
from app.services import daily_limit
from app.services.daily_limit import (
    DAILY_CHAT_CREDITS_FREE,
    GENERAL_CHAT_CREDIT_COST,
    TURN_CHAT_CREDIT_COST,
    enforce_chat_daily_limit,
)


def _user(tier=UserTier.free):
    from uuid import uuid4

    return type(
        "U",
        (),
        {"id": uuid4(), "clerk_user_id": "u_1", "tier": tier, "timezone": "UTC"},
    )()


def _patch_used(monkeypatch, used: int):
    """Stub the lazy day-rollover read to report `used` credits spent today."""

    async def _check(db, user):
        return used

    monkeypatch.setattr(daily_limit, "check_and_reset_chat", _check)


def test_credit_costs_are_weighted():
    assert TURN_CHAT_CREDIT_COST == 1
    assert GENERAL_CHAT_CREDIT_COST == 2
    assert DAILY_CHAT_CREDITS_FREE == 20


async def test_fresh_day_allows_both_surfaces(monkeypatch):
    _patch_used(monkeypatch, 0)
    user = _user()
    await enforce_chat_daily_limit(None, user, cost=TURN_CHAT_CREDIT_COST)
    await enforce_chat_daily_limit(None, user, cost=GENERAL_CHAT_CREDIT_COST)


async def test_one_credit_left_allows_turn_but_blocks_general(monkeypatch):
    """The whole point of a weighted budget: `remaining < cost`, not
    `remaining == 0`."""
    _patch_used(monkeypatch, DAILY_CHAT_CREDITS_FREE - 1)
    user = _user()

    await enforce_chat_daily_limit(None, user, cost=TURN_CHAT_CREDIT_COST)

    with pytest.raises(HTTPException) as exc:
        await enforce_chat_daily_limit(None, user, cost=GENERAL_CHAT_CREDIT_COST)
    assert exc.value.status_code == 429
    assert "1 of your 20 daily chat credits" in exc.value.detail
    assert "costs 2" in exc.value.detail


async def test_two_credits_left_allows_general(monkeypatch):
    _patch_used(monkeypatch, DAILY_CHAT_CREDITS_FREE - 2)
    await enforce_chat_daily_limit(None, _user(), cost=GENERAL_CHAT_CREDIT_COST)


async def test_exhausted_budget_blocks_everything(monkeypatch):
    _patch_used(monkeypatch, DAILY_CHAT_CREDITS_FREE)
    user = _user()
    for cost in (TURN_CHAT_CREDIT_COST, GENERAL_CHAT_CREDIT_COST):
        with pytest.raises(HTTPException) as exc:
            await enforce_chat_daily_limit(None, user, cost=cost)
        assert exc.value.status_code == 429


async def test_over_budget_counter_never_reports_negative_remaining(monkeypatch):
    """Defensive: a counter past the cap (a raced double-charge) must still
    produce sane copy, not "-3 of your 20 credits left"."""
    _patch_used(monkeypatch, DAILY_CHAT_CREDITS_FREE + 3)
    with pytest.raises(HTTPException) as exc:
        await enforce_chat_daily_limit(None, _user(), cost=TURN_CHAT_CREDIT_COST)
    assert "0 of your 20 daily chat credits" in exc.value.detail


async def test_pro_tier_skips_the_gate(monkeypatch):
    async def _never(db, user):
        raise AssertionError("pro tier must not read the counter")

    monkeypatch.setattr(daily_limit, "check_and_reset_chat", _never)
    await enforce_chat_daily_limit(None, _user(UserTier.pro), cost=GENERAL_CHAT_CREDIT_COST)


async def test_default_cost_is_the_turn_surface(monkeypatch):
    """Legacy callers that pass no `cost` keep charging 1, so the turn chat
    behaves exactly as before."""
    _patch_used(monkeypatch, DAILY_CHAT_CREDITS_FREE - 1)
    await enforce_chat_daily_limit(None, _user())
