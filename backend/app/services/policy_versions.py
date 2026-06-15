"""Versioned acceptance of the Terms of Service and Privacy Policy.

These constants are the source of truth for the *current* policy versions. When a
policy materially changes, bump the matching constant: every user whose stored
`users.terms_accepted_version` / `users.privacy_accepted_version` is now behind
the constant is treated as not having accepted, and the frontend's forced
acceptance gate re-prompts them before they can use the Service.

The frontend mirrors these by hand in `frontend/src/lib/policyAcceptance.ts` —
keep the two in sync (same discipline as `DELIVERY_ANALYTICS_NOTICE_VERSION`).
"""

from app.db.models.user import User


CURRENT_TERMS_VERSION = 1
# v3 (2026-06): geo-gated product analytics — EU/UK strict opt-in retained, while
# US runs full GA4 and AU/NZ/SG run cookieless analytics by default under a
# notice + opt-out model. Material change to collection + legal basis for non-EU
# users → forced re-acceptance.
CURRENT_PRIVACY_VERSION = 3


def has_accepted_current_policies(user: User) -> bool:
    """True only when the user has accepted the current Terms AND Privacy versions."""
    return (
        user.terms_accepted_version == CURRENT_TERMS_VERSION
        and user.privacy_accepted_version == CURRENT_PRIVACY_VERSION
    )
