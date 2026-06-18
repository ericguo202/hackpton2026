"""Versioned acceptance of the Terms of Service and Privacy Policy.

These constants are the source of truth for the *current* policy versions. When a
policy materially changes, bump the matching constant: every user whose stored
`users.terms_accepted_version` / `users.privacy_accepted_version` is now behind
the constant is treated as not having accepted, and the frontend's forced
acceptance gate re-prompts them before they can use the Service.

The frontend mirrors these by hand in `frontend/src/lib/policyAcceptance.ts` —
keep the two in sync (same discipline as `DELIVERY_ANALYTICS_NOTICE_VERSION`).
"""

CURRENT_TERMS_VERSION = 1
CURRENT_PRIVACY_VERSION = 1
