"""Email all users when a policy version is bumped.

Policy versions (Terms of Service, Privacy Policy, Biometric Data Retention
Policy) are source-code constants in `policy_versions.py`, bumped at deploy time.
This module detects a bump by comparing each constant against the last value we
emailed about (persisted in `policy_notification_state`) and, on an increase,
emails every user with an address.

The sweep runs once at app startup — which is exactly when a deploy could have
raised a version. Two safeguards mirror `delivery_retention_scheduler`:

  * A Postgres transaction-level advisory lock so only one blue/green replica
    acts.
  * A first-run baseline: a missing state row is seeded to the current version
    WITHOUT emailing, so the feature's first deploy never blasts users about the
    version they already hold.

The version is *claimed* (state row updated) under the lock before any mail goes
out, so the other replica can't double-send. The trade-off — a crash mid-batch
won't re-notify for that policy — is acceptable: emails are best-effort and the
volume is tiny.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.db.models.policy_notification_state import PolicyNotificationState
from app.db.models.user import User
from app.db.session import AsyncSessionLocal
from app.services.email import mailgun_configured, send_email
from app.services.policy_versions import (
    CURRENT_BIOMETRIC_VERSION,
    CURRENT_PRIVACY_VERSION,
    CURRENT_TERMS_VERSION,
)

logger = logging.getLogger(__name__)

# Stable 64-bit advisory-lock key, distinct from the retention sweep's
# (0x5D11_3E47_2026_0610).
_ADVISORY_LOCK_KEY = 0x5D11_3E47_2026_0622

_REPROMPT_LINE = (
    "The next time you log in to InterviewPie, you will be prompted to accept "
    "the policy's latest version. "
)


@dataclass(frozen=True)
class _Policy:
    key: str
    display_name: str
    link_path: str
    reprompt: bool

    @property
    def current_version(self) -> int:
        return _CURRENT_VERSIONS[self.key]


# Registry — one entry per watched policy. `current_version` reads the live
# source constant (looked up via _CURRENT_VERSIONS so tests can monkeypatch).
_CURRENT_VERSIONS: dict[str, int] = {
    "terms": CURRENT_TERMS_VERSION,
    "privacy": CURRENT_PRIVACY_VERSION,
    "biometric": CURRENT_BIOMETRIC_VERSION,
}

POLICIES: tuple[_Policy, ...] = (
    _Policy("terms", "Terms of Service", "/legal/terms", reprompt=True),
    _Policy("privacy", "Privacy Policy", "/legal/privacy", reprompt=True),
    _Policy(
        "biometric",
        "Biometric Data Retention Policy",
        "/legal/biometric-data-retention",
        reprompt=False,
    ),
)


def _build_email(policy: _Policy) -> tuple[str, str]:
    """Return (subject, text body) for a policy-change notification."""
    link = f"{settings.POLICY_NOTIFICATION_BASE_URL.rstrip('/')}{policy.link_path}"
    reprompt = _REPROMPT_LINE if policy.reprompt else ""
    subject = f"We've Updated Our {policy.display_name}"
    body = (
        "Hello,\n\n"
        f"We have updated our {policy.display_name}. {reprompt}"
        f"You can access the latest version of the {policy.display_name} "
        f"here: {link}.\n\n"
        "Thank you for using InterviewPie.\n"
        "The InterviewPie Team\n\n"
        "Please do not reply to this email. This mailbox is not monitored. "
        "For customer support, email hello@interviewpie.com"
    )
    return subject, body


def _diff_policies(
    stored: dict[str, int],
) -> tuple[list[_Policy], list[_Policy]]:
    """Pure decision: given the persisted notified-versions, split the registry
    into (to_seed, to_claim).

    * to_seed  — never-seen policies (no stored row): baseline the current
      version WITHOUT emailing (first-run guard).
    * to_claim — policies whose current version exceeds the stored one: email
      users and advance the row.
    """
    to_seed: list[_Policy] = []
    to_claim: list[_Policy] = []
    for policy in POLICIES:
        if policy.key not in stored:
            to_seed.append(policy)
        elif policy.current_version > stored[policy.key]:
            to_claim.append(policy)
    return to_seed, to_claim


async def _claim_changed_policies() -> list[_Policy]:
    """Under the advisory lock, seed/advance state rows and return the policies
    whose version increased (and were claimed) so the caller can email them.

    First-encounter (no row) seeds the baseline without claiming. Runs in one
    short transaction; the xact lock auto-releases on commit.
    """
    async with AsyncSessionLocal() as db:
        async with db.begin():
            acquired = await db.scalar(
                text("SELECT pg_try_advisory_xact_lock(:key)"),
                {"key": _ADVISORY_LOCK_KEY},
            )
            if not acquired:
                # Another replica is sweeping — skip.
                return []

            rows = (
                await db.execute(select(PolicyNotificationState))
            ).scalars().all()
            stored = {r.policy_key: r.notified_version for r in rows}
            to_seed, to_claim = _diff_policies(stored)

            for policy in to_seed:
                # First run: baseline the current version, do NOT email.
                await db.execute(
                    pg_insert(PolicyNotificationState.__table__).values(
                        policy_key=policy.key,
                        notified_version=policy.current_version,
                    ).on_conflict_do_nothing(index_elements=["policy_key"])
                )
            for policy in to_claim:
                # Claim it now so the peer replica won't also send.
                await db.execute(
                    PolicyNotificationState.__table__.update()
                    .where(PolicyNotificationState.policy_key == policy.key)
                    .values(
                        notified_version=policy.current_version,
                        updated_at=text("NOW()"),
                    )
                )
            return to_claim


async def _recipient_emails() -> list[str]:
    """All non-null user emails (any onboarding state)."""
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(select(User.email).where(User.email.isnot(None)))
        ).scalars().all()
    return [e for e in rows if e]


async def _send_policy_email(policy: _Policy, recipients: list[str]) -> None:
    subject, body = _build_email(policy)
    sent = failed = 0
    for email in recipients:
        ok = await send_email(to=email, subject=subject, text=body)
        if ok:
            sent += 1
        else:
            failed += 1
    logger.info(
        "Policy-change notice for %s (v%d): %d sent, %d failed.",
        policy.key,
        policy.current_version,
        sent,
        failed,
    )


async def run_policy_notification_sweep_once() -> None:
    """Detect policy version bumps and email all users. Best-effort."""
    if not mailgun_configured():
        # Still seed/advance state so we don't backlog a "change" to spam later
        # once Mailgun is configured — but skip the (no-op) send work.
        await _claim_changed_policies()
        logger.info("Policy notification sweep: Mailgun unconfigured, state only.")
        return

    claimed = await _claim_changed_policies()
    if not claimed:
        return
    recipients = await _recipient_emails()
    if not recipients:
        logger.info("Policy-change notice: %d policy(ies) changed but no "
                    "recipients.", len(claimed))
        return
    for policy in claimed:
        await _send_policy_email(policy, recipients)


def start_policy_notification_sweep() -> asyncio.Task | None:
    """Spawn the one-shot startup sweep as a background task (or None if off)."""
    if not settings.POLICY_NOTIFICATION_ENABLED:
        logger.info("Policy notification sweep disabled via settings.")
        return None
    return asyncio.create_task(_run_sweep_guarded())


async def _run_sweep_guarded() -> None:
    try:
        await run_policy_notification_sweep_once()
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Policy notification sweep failed")
