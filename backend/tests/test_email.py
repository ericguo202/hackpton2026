"""
Unit tests for the Mailgun email client — httpx call fully mocked.

Best-effort contract: send_email NEVER raises; it returns False when Mailgun is
unconfigured or any HTTP/transport error occurs, True on a 2xx.
"""

from types import SimpleNamespace

from app.services import email
from app.services.email import mailgun_configured, send_email


def _configure(monkeypatch):
    monkeypatch.setattr(email.settings, "MAILGUN_API_KEY", "key-test")
    monkeypatch.setattr(email.settings, "MAILGUN_DOMAIN", "mg.interviewpie.com")
    monkeypatch.setattr(email.settings, "MAILGUN_BASE_URL", "https://api.mailgun.net/v3")
    monkeypatch.setattr(
        email.settings, "MAILGUN_FROM", "InterviewPie <noreply@interviewpie.com>"
    )


def _mock_post(monkeypatch, captured: dict, status: int = 200):
    async def _fake_post(self, url, **kwargs):
        captured["url"] = url
        captured["auth"] = kwargs.get("auth")
        captured["data"] = kwargs.get("data")

        def _raise():
            if status >= 400:
                raise RuntimeError(f"HTTP {status}")

        return SimpleNamespace(status_code=status, raise_for_status=_raise)

    monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)


async def test_sends_well_formed_request(monkeypatch):
    _configure(monkeypatch)
    captured: dict = {}
    _mock_post(monkeypatch, captured)

    ok = await send_email(to="user@x.com", subject="Hi", text="Body text.")

    assert ok is True
    assert captured["url"] == (
        "https://api.mailgun.net/v3/mg.interviewpie.com/messages"
    )
    assert captured["auth"] == ("api", "key-test")
    assert captured["data"]["to"] == "user@x.com"
    assert captured["data"]["subject"] == "Hi"
    assert captured["data"]["text"] == "Body text."
    assert captured["data"]["from"] == "InterviewPie <noreply@interviewpie.com>"


async def test_custom_from_overrides_default(monkeypatch):
    _configure(monkeypatch)
    captured: dict = {}
    _mock_post(monkeypatch, captured)

    await send_email(
        to="user@x.com", subject="Hi", text="x", from_addr="ops@interviewpie.com"
    )
    assert captured["data"]["from"] == "ops@interviewpie.com"


async def test_unconfigured_skips_and_returns_false(monkeypatch):
    monkeypatch.setattr(email.settings, "MAILGUN_API_KEY", None)
    monkeypatch.setattr(email.settings, "MAILGUN_DOMAIN", "mg.interviewpie.com")

    called = False

    async def _boom(self, *a, **k):
        nonlocal called
        called = True
        raise AssertionError("httpx must not be called when unconfigured")

    monkeypatch.setattr("httpx.AsyncClient.post", _boom)

    assert mailgun_configured() is False
    assert await send_email(to="u@x.com", subject="s", text="t") is False
    assert called is False


async def test_http_error_returns_false_never_raises(monkeypatch):
    _configure(monkeypatch)
    captured: dict = {}
    _mock_post(monkeypatch, captured, status=500)

    assert await send_email(to="u@x.com", subject="s", text="t") is False
