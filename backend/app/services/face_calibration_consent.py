"""Consent helpers for browser-local face/delivery calibration.

The calibration profile (a small set of aggregate face-geometry baselines used
by the webcam delivery heuristic) stays on the candidate's device and never
reaches our server. The *consent* to perform calibration, however, lives on the
user row so it is demonstrable (GDPR Art. 7(1) / BIPA) and cannot leak across
accounts that share a browser.

Unlike `delivery_consent.py`, there is NO server-side artifact to purge on
revocation — the only stored data is the local profile, which the client clears
itself. So this module is just the version constant + the active-consent check;
the revoke endpoint simply stamps `face_calibration_revoked_at`.
"""

from app.db.models.user import User


# Notice version. Bump whenever the calibration privacy notice copy changes
# (mirror the bump in the frontend's faceCalibrationConsent.ts). A stored
# consent at an older version is treated as not-active, so `/calibrate`
# re-prompts and the stale local baseline is cleared. Deliberately decoupled
# from CURRENT_BIOMETRIC_VERSION (policy_versions.py), mirroring how
# DELIVERY_ANALYTICS_NOTICE_VERSION is its own constant.
FACE_CALIBRATION_NOTICE_VERSION = 1


def has_active_face_calibration_consent(user: User) -> bool:
    """Return True only for the current, non-revoked notice version."""
    if user.face_calibration_consent_at is None:
        return False
    if user.face_calibration_consent_version != FACE_CALIBRATION_NOTICE_VERSION:
        return False
    revoked_at = user.face_calibration_revoked_at
    return revoked_at is None or revoked_at < user.face_calibration_consent_at
