"""
Unit tests for the duplicate-email detection in `GET /me`.

`get_me` stamps a transient `email_conflict` flag onto the returned user when a
pre-onboarding caller's session-token email is already claimed by a DIFFERENT
users row. These tests call the handler directly with a mocked AsyncSession —
no Postgres — mirroring the service-level unit tests in this suite.

A `pro`-tier user is used throughout so the free-tier `check_and_reset_turns`
branch is skipped (it's irrelevant to this logic and would need its own mock).
"""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.api.v1.endpoints import me as me_module
from app.core.auth import ClerkClaims
from app.db.models.enums import UserTier


def _claims(sub: str = "user_new", email: str | None = "dup@example.com") -> ClerkClaims:
    return ClerkClaims(sub=sub, iss="https://x.clerk.dev", exp=9_999_999_999, iat=0, email=email)


def _user(**overrides) -> SimpleNamespace:
    base = dict(tier=UserTier.pro, completed_registration=False)
    base.update(overrides)
    return SimpleNamespace(**base)


async def test_flags_conflict_when_email_claimed_by_other_row():
    user = _user()
    db = AsyncMock()
    db.scalar.return_value = uuid.uuid4()  # another row owns this email

    result = await me_module.get_me(claims=_claims(), user=user, db=db)

    assert result.email_conflict is True
    db.scalar.assert_awaited_once()


async def test_no_conflict_when_email_unclaimed():
    user = _user()
    db = AsyncMock()
    db.scalar.return_value = None

    result = await me_module.get_me(claims=_claims(), user=user, db=db)

    assert result.email_conflict is False


async def test_skips_check_once_onboarded():
    user = _user(completed_registration=True)
    db = AsyncMock()

    result = await me_module.get_me(claims=_claims(), user=user, db=db)

    db.scalar.assert_not_called()
    # Never stamped → UserOut's default (False) applies.
    assert getattr(result, "email_conflict", False) is False


async def test_fails_open_when_email_claim_absent():
    # Clerk dashboard claim not configured → claims.email is None → skip.
    user = _user()
    db = AsyncMock()

    result = await me_module.get_me(claims=_claims(email=None), user=user, db=db)

    db.scalar.assert_not_called()
    assert getattr(result, "email_conflict", False) is False
