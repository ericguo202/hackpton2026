"""Consent helpers for server-stored webcam delivery analytics.

The browser may compute MediaPipe-based delivery summaries during practice.
Raw video frames and landmarks stay client-side, but the numeric per-turn
summary (`interview_turns.cv_summary`) is stored server-side, so consent for
that artifact must be demonstrable on the user row.
"""

from app.db.models.user import User


DELIVERY_ANALYTICS_NOTICE_VERSION = 1


def has_active_delivery_analytics_consent(user: User) -> bool:
    """Return True only for the current, non-revoked notice version."""
    if user.delivery_analytics_consent_at is None:
        return False
    if user.delivery_analytics_consent_version != DELIVERY_ANALYTICS_NOTICE_VERSION:
        return False
    revoked_at = user.delivery_analytics_revoked_at
    return revoked_at is None or revoked_at < user.delivery_analytics_consent_at
