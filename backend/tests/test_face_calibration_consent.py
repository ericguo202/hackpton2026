"""
Unit tests for server-side face calibration consent.

Covers the active-consent predicate (`has_active_face_calibration_consent`) and
the PUT/DELETE endpoint handlers. Mirrors `test_me_email_conflict.py`: the
handlers are called directly with a mocked AsyncSession — no Postgres.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import me as me_module
from app.schemas.user import FaceCalibrationConsentIn
from app.services.face_calibration_consent import (
    FACE_CALIBRATION_NOTICE_VERSION,
    has_active_face_calibration_consent,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(**overrides) -> SimpleNamespace:
    base = dict(
        face_calibration_consent_at=None,
        face_calibration_consent_version=None,
        face_calibration_revoked_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ---- has_active_face_calibration_consent --------------------------------------


def test_inactive_when_never_consented():
    assert has_active_face_calibration_consent(_user()) is False


def test_active_for_current_version_not_revoked():
    user = _user(
        face_calibration_consent_at=_now(),
        face_calibration_consent_version=FACE_CALIBRATION_NOTICE_VERSION,
    )
    assert has_active_face_calibration_consent(user) is True


def test_inactive_for_stale_notice_version():
    # The version gate: an older stored version re-prompts and clears the baseline.
    user = _user(
        face_calibration_consent_at=_now(),
        face_calibration_consent_version=FACE_CALIBRATION_NOTICE_VERSION - 1,
    )
    assert has_active_face_calibration_consent(user) is False


def test_inactive_when_revoked_after_consent():
    consent_at = _now()
    user = _user(
        face_calibration_consent_at=consent_at,
        face_calibration_consent_version=FACE_CALIBRATION_NOTICE_VERSION,
        face_calibration_revoked_at=consent_at + timedelta(minutes=1),
    )
    assert has_active_face_calibration_consent(user) is False


def test_active_when_revoked_before_a_newer_consent():
    consent_at = _now()
    user = _user(
        face_calibration_consent_at=consent_at,
        face_calibration_consent_version=FACE_CALIBRATION_NOTICE_VERSION,
        face_calibration_revoked_at=consent_at - timedelta(minutes=1),
    )
    assert has_active_face_calibration_consent(user) is True


# ---- PUT /me/face-calibration-consent ----------------------------------------


async def test_accept_persists_consent():
    user = _user()
    db = AsyncMock()
    body = FaceCalibrationConsentIn(
        notice_version=FACE_CALIBRATION_NOTICE_VERSION, accepted=True
    )

    result = await me_module.accept_face_calibration_consent(
        body=body, user=user, db=db
    )

    assert result is user
    assert user.face_calibration_consent_at is not None
    assert user.face_calibration_consent_version == FACE_CALIBRATION_NOTICE_VERSION
    assert user.face_calibration_revoked_at is None
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once()


async def test_accept_rejects_unaccepted():
    user = _user()
    db = AsyncMock()
    body = FaceCalibrationConsentIn(
        notice_version=FACE_CALIBRATION_NOTICE_VERSION, accepted=False
    )

    with pytest.raises(HTTPException) as exc:
        await me_module.accept_face_calibration_consent(body=body, user=user, db=db)
    assert exc.value.status_code == 422
    db.commit.assert_not_called()


async def test_accept_rejects_stale_notice_version():
    user = _user()
    db = AsyncMock()
    body = FaceCalibrationConsentIn(
        notice_version=FACE_CALIBRATION_NOTICE_VERSION + 1, accepted=True
    )

    with pytest.raises(HTTPException) as exc:
        await me_module.accept_face_calibration_consent(body=body, user=user, db=db)
    assert exc.value.status_code == 409
    db.commit.assert_not_called()


# ---- DELETE /me/face-calibration-consent -------------------------------------


async def test_revoke_stamps_revocation():
    user = _user(
        face_calibration_consent_at=_now(),
        face_calibration_consent_version=FACE_CALIBRATION_NOTICE_VERSION,
    )
    db = AsyncMock()

    result = await me_module.revoke_face_calibration_consent(user=user, db=db)

    assert result is user
    assert user.face_calibration_revoked_at is not None
    assert has_active_face_calibration_consent(user) is False
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once()
