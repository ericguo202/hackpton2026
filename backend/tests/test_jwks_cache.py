"""
Unit tests for the JWKS cache in `app.core.auth` — the refetch-on-miss + TTL
behavior that keeps a Clerk key rotation from turning into a total auth outage.

We exercise `_get_jwks` / `_select_key` directly (no crypto, no network): the
network fetch is faked via monkeypatching `_fetch_jwks`, and time is driven by a
fake `time.monotonic` so TTL/throttle windows are deterministic.
"""

import asyncio

import pytest

from app.core import auth


@pytest.fixture
def clock(monkeypatch):
    """Deterministic monotonic clock for TTL/throttle math."""
    state = {"t": 1000.0}
    monkeypatch.setattr(auth.time, "monotonic", lambda: state["t"])
    return state


@pytest.fixture(autouse=True)
def _reset_cache():
    """Isolate the module-level cache between tests."""
    auth._jwks_cache = None
    auth._jwks_fetched_at = 0.0
    yield
    auth._jwks_cache = None
    auth._jwks_fetched_at = 0.0


def _fake_fetch(keysets, calls):
    """Return an async `_fetch_jwks` that yields successive keysets and records calls."""

    async def fetch():
        idx = min(len(calls), len(keysets) - 1)
        calls.append(1)
        return keysets[idx]

    return fetch


def test_select_key_matches_kid():
    jwks = {"keys": [{"kid": "A"}, {"kid": "B"}]}
    assert auth._select_key(jwks, "B") == {"kid": "B"}
    assert auth._select_key(jwks, "Z") is None
    # Missing/None kid and a malformed doc are graceful misses, not crashes.
    assert auth._select_key({}, None) is None


async def test_first_call_fetches_then_serves_from_cache(clock, monkeypatch):
    calls: list = []
    monkeypatch.setattr(auth, "_fetch_jwks", _fake_fetch([{"keys": [{"kid": "A"}]}], calls))

    first = await auth._get_jwks()
    assert first == {"keys": [{"kid": "A"}]}
    assert len(calls) == 1

    # Within the TTL, a second call hits the cache — no new network fetch.
    await auth._get_jwks()
    assert len(calls) == 1


async def test_force_refresh_picks_up_rotation(clock, monkeypatch):
    calls: list = []
    monkeypatch.setattr(
        auth,
        "_fetch_jwks",
        _fake_fetch([{"keys": [{"kid": "A"}]}, {"keys": [{"kid": "B"}]}], calls),
    )

    await auth._get_jwks()  # caches key A
    assert auth._select_key(auth._jwks_cache, "B") is None

    # Advance past the throttle floor so a miss-triggered refetch is allowed.
    clock["t"] += auth._JWKS_MIN_REFETCH_INTERVAL_SECONDS + 1
    jwks = await auth._get_jwks(force_refresh=True)

    assert auth._select_key(jwks, "B") is not None
    assert len(calls) == 2


async def test_force_refresh_throttled_within_floor(clock, monkeypatch):
    calls: list = []
    monkeypatch.setattr(auth, "_fetch_jwks", _fake_fetch([{"keys": [{"kid": "A"}]}], calls))

    await auth._get_jwks()  # fetch #1 at t=1000
    # A bogus-kid flood arriving right after the fetch must NOT hit the network.
    clock["t"] += 5  # still inside the throttle floor
    result = await auth._get_jwks(force_refresh=True)

    assert len(calls) == 1
    assert result == {"keys": [{"kid": "A"}]}


async def test_ttl_expiry_refetches_proactively(clock, monkeypatch):
    calls: list = []
    monkeypatch.setattr(
        auth,
        "_fetch_jwks",
        _fake_fetch([{"keys": [{"kid": "A"}]}, {"keys": [{"kid": "B"}]}], calls),
    )

    await auth._get_jwks()  # fetch #1
    clock["t"] += auth._JWKS_TTL_SECONDS + 1  # cache goes stale
    jwks = await auth._get_jwks()  # fetch #2, no force needed

    assert len(calls) == 2
    assert auth._select_key(jwks, "B") is not None


async def test_concurrent_stale_callers_trigger_single_fetch(clock, monkeypatch):
    calls: list = []

    async def slow_fetch():
        calls.append(1)
        await asyncio.sleep(0)  # yield so peers pile up on the lock
        return {"keys": [{"kid": "A"}]}

    monkeypatch.setattr(auth, "_fetch_jwks", slow_fetch)

    results = await asyncio.gather(*[auth._get_jwks() for _ in range(10)])

    assert len(calls) == 1
    assert all(r == {"keys": [{"kid": "A"}]} for r in results)
