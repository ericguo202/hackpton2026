"""
Unit tests for the policy-change notifier.

Covers the pure decision logic (`_diff_policies`, `_build_email`) and the
orchestration of `run_policy_notification_sweep_once` (DB helpers monkeypatched
so no database is needed): first-run seeds without sending, a version bump emails
every recipient, and the idempotent no-change case sends nothing.
"""

from app.services import policy_notifications as pn
from app.services.policy_notifications import (
    POLICIES,
    _build_email,
    _diff_policies,
    run_policy_notification_sweep_once,
)


def _policy(key: str) -> object:
    return next(p for p in POLICIES if p.key == key)


# ── _diff_policies (pure) ─────────────────────────────────────────────────────


def test_diff_first_run_seeds_all_claims_none(monkeypatch):
    monkeypatch.setattr(
        pn, "_CURRENT_VERSIONS", {"terms": 1, "privacy": 1, "biometric": 1}
    )
    to_seed, to_claim = _diff_policies({})
    assert {p.key for p in to_seed} == {"terms", "privacy", "biometric"}
    assert to_claim == []


def test_diff_no_change_is_noop(monkeypatch):
    monkeypatch.setattr(
        pn, "_CURRENT_VERSIONS", {"terms": 1, "privacy": 1, "biometric": 1}
    )
    to_seed, to_claim = _diff_policies(
        {"terms": 1, "privacy": 1, "biometric": 1}
    )
    assert to_seed == []
    assert to_claim == []


def test_diff_bump_claims_only_changed(monkeypatch):
    monkeypatch.setattr(
        pn, "_CURRENT_VERSIONS", {"terms": 2, "privacy": 1, "biometric": 1}
    )
    to_seed, to_claim = _diff_policies(
        {"terms": 1, "privacy": 1, "biometric": 1}
    )
    assert to_seed == []
    assert [p.key for p in to_claim] == ["terms"]


# ── _build_email (pure) ───────────────────────────────────────────────────────


def test_build_email_terms_has_reprompt_and_link(monkeypatch):
    monkeypatch.setattr(
        pn.settings, "POLICY_NOTIFICATION_BASE_URL", "https://interviewpie.com"
    )
    subject, body = _build_email(_policy("terms"))
    assert subject == "We've Updated Our Terms of Service"
    assert "you will be prompted to accept" in body
    assert "https://interviewpie.com/legal/terms" in body
    assert "hello@interviewpie.com" in body


def test_build_email_biometric_omits_reprompt(monkeypatch):
    monkeypatch.setattr(
        pn.settings, "POLICY_NOTIFICATION_BASE_URL", "https://interviewpie.com"
    )
    subject, body = _build_email(_policy("biometric"))
    assert subject == "We've Updated Our Biometric Data Retention Policy"
    assert "you will be prompted to accept" not in body
    assert "https://interviewpie.com/legal/biometric-data-retention" in body


# ── run_policy_notification_sweep_once (orchestration) ────────────────────────


def _capture_sends(monkeypatch) -> list:
    sent: list = []

    async def _capture(*, to, subject, text):
        sent.append({"to": to, "subject": subject, "text": text})
        return True

    monkeypatch.setattr(pn, "send_email", _capture)
    monkeypatch.setattr(pn, "mailgun_configured", lambda: True)
    return sent


async def test_sweep_emails_all_recipients_on_bump(monkeypatch):
    sent = _capture_sends(monkeypatch)

    async def _claim():
        return [_policy("terms")]

    async def _recipients():
        return ["a@x.com", "b@x.com"]

    monkeypatch.setattr(pn, "_claim_changed_policies", _claim)
    monkeypatch.setattr(pn, "_recipient_emails", _recipients)

    await run_policy_notification_sweep_once()

    assert {m["to"] for m in sent} == {"a@x.com", "b@x.com"}
    assert all(m["subject"] == "We've Updated Our Terms of Service" for m in sent)


async def test_sweep_no_claims_sends_nothing(monkeypatch):
    sent = _capture_sends(monkeypatch)

    async def _claim():
        return []

    called = False

    async def _recipients():
        nonlocal called
        called = True
        return ["a@x.com"]

    monkeypatch.setattr(pn, "_claim_changed_policies", _claim)
    monkeypatch.setattr(pn, "_recipient_emails", _recipients)

    await run_policy_notification_sweep_once()

    assert sent == []
    assert called is False  # recipients never queried when nothing changed


async def test_sweep_unconfigured_claims_state_but_sends_nothing(monkeypatch):
    sent = _capture_sends(monkeypatch)
    monkeypatch.setattr(pn, "mailgun_configured", lambda: False)

    claim_called = False

    async def _claim():
        nonlocal claim_called
        claim_called = True
        return [_policy("terms")]

    monkeypatch.setattr(pn, "_claim_changed_policies", _claim)

    await run_policy_notification_sweep_once()

    assert claim_called is True  # state still advanced
    assert sent == []
