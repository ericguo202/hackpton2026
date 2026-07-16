"""
Clerk JWT authentication.

Clerk issues short-lived session JWTs to signed-in users in the browser.
The frontend attaches one to each API request as `Authorization: Bearer <token>`.
This module verifies those tokens so protected routes can trust the caller's identity.

Verification flow:
  1. Fetch Clerk's public signing keys (JWKS) from {issuer}/.well-known/jwks.json
  2. Pick the key whose `kid` (key id) matches the token header's `kid`
  3. Verify the RS256 signature, issuer (`iss`), and expiry (`exp`) with python-jose
  4. Return the decoded claims (`sub` is the Clerk user id)

We never share secrets with Clerk here — JWKS is public by design.
"""

import asyncio
import logging
import time
from typing import Optional

import httpx
from fastapi import Depends, Header, HTTPException, Request, status
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models.user import User
from app.db.session import get_db
from app.services.incidents import log_user_created, log_user_signed_in

logger = logging.getLogger(__name__)


# Process-wide JWKS cache. Clerk rotates its signing keys rarely (months), but
# when it does, a cache that never refreshes would 401 *every* request until a
# manual restart — a total auth outage from a routine Clerk-side event. So the
# cache is refreshed on two triggers (see `_get_jwks`): a TTL (proactive) and a
# `kid` miss during verification (reactive, throttled). `_jwks_fetched_at` is a
# `time.monotonic()` stamp of the last successful fetch (0.0 = never fetched).
_jwks_cache: Optional[dict] = None
_jwks_fetched_at: float = 0.0
# Serializes refreshes so N concurrent callers that all see a stale cache
# trigger exactly ONE network fetch (double-checked inside the lock).
_jwks_lock = asyncio.Lock()

# Treat the cache as stale after this long even without a miss, so a key
# rotation is picked up within the hour on an otherwise-quiet key set.
_JWKS_TTL_SECONDS = 3600
# Floor between miss-triggered (forced) refetches. A flood of tokens bearing
# bogus `kid`s must not be able to stampede Clerk with fetches: once we've
# fetched this recently, a miss falls straight through to a 401 instead of
# hitting the network again.
_JWKS_MIN_REFETCH_INTERVAL_SECONDS = 60

# Clock-skew tolerance (seconds) applied to the `exp`/`iat`/`nbf` claim checks.
# Clerk session tokens are very short-lived (~60s) and the frontend's
# `getToken()` only refreshes a token once it's within ~10s of expiry *by the
# browser's clock*. A device whose clock trails the server by more than that
# window (common on phones without accurate time sync) hands us a token it
# still considers valid while the server, with zero leeway, would see it as
# already expired — surfacing to the user as a spurious "Invalid token" 401
# the moment they trigger a delayed request (e.g. starting an interview after
# the mic-permission prompt). A small leeway absorbs that skew without
# meaningfully widening the acceptance window (Clerk's own backend SDKs apply a
# default clock-skew allowance for the same reason).
_CLOCK_SKEW_LEEWAY_SECONDS = 60


async def _fetch_jwks() -> dict:
    """Download Clerk's public JWKS document (no caching — see `_get_jwks`)."""
    # rstrip("/") defends against issuers configured with a trailing slash
    # that would produce a double-slash URL and a 404 from Clerk.
    issuer = settings.CLERK_JWT_ISSUER.rstrip("/")
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{issuer}/.well-known/jwks.json")
        resp.raise_for_status()
        return resp.json()


def _cache_is_fresh(now: float) -> bool:
    """True when the cache is populated and younger than the TTL."""
    return _jwks_cache is not None and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS


def _refetch_throttled(now: float) -> bool:
    """True when a forced refetch should be suppressed (fetched too recently).

    A miss that arrives right after a fetch is almost certainly a bogus `kid`,
    not a rotation we've yet to observe — so serve the current cache and let the
    caller 401 rather than hitting Clerk again.
    """
    return (
        _jwks_cache is not None
        and (now - _jwks_fetched_at) < _JWKS_MIN_REFETCH_INTERVAL_SECONDS
    )


async def _get_jwks(*, force_refresh: bool = False) -> dict:
    """Return Clerk's JWKS, refreshing the process-wide cache when needed.

    Refresh triggers:
      - TTL expiry (proactive): the cache goes stale after `_JWKS_TTL_SECONDS`,
        so a key rotation is picked up within the hour even without a miss.
      - `force_refresh` (reactive): `current_user` sets this when a token's
        `kid` isn't in the cached set — the signature of a just-rotated key.
        Throttled by `_JWKS_MIN_REFETCH_INTERVAL_SECONDS`.

    Concurrency: an `asyncio.Lock` plus double-checked staleness means N
    concurrent callers that all see a stale cache trigger exactly ONE fetch.
    """
    global _jwks_cache, _jwks_fetched_at

    now = time.monotonic()
    if _cache_is_fresh(now) and not force_refresh:
        return _jwks_cache
    if force_refresh and _refetch_throttled(now):
        return _jwks_cache

    async with _jwks_lock:
        # Re-check under the lock: a peer coroutine may have refreshed while we
        # waited, in which case we ride on its result (no second fetch).
        now = time.monotonic()
        if _cache_is_fresh(now) and not force_refresh:
            return _jwks_cache
        if force_refresh and _refetch_throttled(now):
            return _jwks_cache

        _jwks_cache = await _fetch_jwks()
        _jwks_fetched_at = time.monotonic()
        return _jwks_cache


def _select_key(jwks: dict, kid: Optional[str]) -> Optional[dict]:
    """Pick the JWK whose `kid` matches the token header's, or None."""
    return next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)


class ClerkClaims(BaseModel):
    """
    Subset of Clerk's JWT payload that we care about.

    - `sub`: Clerk user id (stable across sessions; this is what we key on in DB)
    - `iss`: issuer URL; must match CLERK_JWT_ISSUER (enforced by jwt.decode)
    - `exp`: unix expiry timestamp (enforced by jwt.decode)
    - `iat`: issued-at timestamp
    - `sid`: Clerk session id (optional; useful for logging/revocation)
    - `azp`: authorized party / frontend origin (optional; Clerk sets it when
      the token was minted for a specific origin)
    - `email`: caller's primary email. NOT in Clerk's default session token —
      it arrives only when a custom claim is configured in the Clerk Dashboard
      (Sessions → Customize session token → `{"email": "{{user.primary_email_address}}"}`).
      Stays `None` when that claim isn't set, so every consumer must treat it as
      optional and fail open. Used by `GET /me` to detect a duplicate-email
      collision before onboarding (see `endpoints/me.py`).
    """

    sub: str
    iss: str
    exp: int
    iat: int
    sid: Optional[str] = None
    azp: Optional[str] = None
    email: Optional[str] = None


async def current_user(authorization: str = Header(None)) -> ClerkClaims:
    """
    FastAPI dependency that verifies a Clerk-issued JWT on the Authorization header.

    Returns parsed claims on success. Raises HTTP 401 on any failure mode
    (missing header, bad format, unknown signing key, expired token, bad issuer,
    tampered signature). Do NOT return DB user rows from here yet — we'll swap
    to a DB lookup / upsert once the `users` table exists at T+2 in the plan.
    """
    # 1. Presence + format check. We expect exactly "Bearer <token>".
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    token = authorization.removeprefix("Bearer ").strip()

    try:
        # 2. Load Clerk's public keys (cached after first call).
        jwks = await _get_jwks()

        # 3. The JWT header is base64-encoded JSON that tells us WHICH key signed
        #    this token (via `kid`). We read it unverified because we don't yet
        #    have a key to verify with — that's what `kid` helps us choose.
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        key = _select_key(jwks, kid)
        if key is None:
            # `kid` isn't in our cached set. The likeliest cause is a Clerk key
            # rotation this process hasn't observed yet, so refresh once
            # (throttled) and retry before giving up — otherwise a rotation
            # would 401 every request until a manual restart.
            jwks = await _get_jwks(force_refresh=True)
            key = _select_key(jwks, kid)
        if key is None:
            # Still unknown after a fresh fetch: the token wasn't signed by this
            # Clerk instance (or the miss-refetch was throttled).
            raise HTTPException(status_code=401, detail="Unknown signing key")

        # 4. Full verification: RS256 signature + issuer + exp + nbf/iat.
        #    - algorithms=["RS256"] pins the algorithm so an attacker can't
        #      downgrade to `none` or HMAC with the public key as the secret.
        #    - issuer= makes python-jose enforce the `iss` claim equals ours.
        #    - verify_aud=False: Clerk session tokens don't set `aud` by default
        #      unless you configure a custom JWT template with an audience.
        #    - leeway: absorb client/server clock skew on the exp/iat/nbf checks
        #      so a slightly-drifted device clock doesn't get a spurious 401
        #      (see _CLOCK_SKEW_LEEWAY_SECONDS above).
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.CLERK_JWT_ISSUER.rstrip("/"),
            options={"verify_aud": False, "leeway": _CLOCK_SKEW_LEEWAY_SECONDS},
        )
    except JWTError as e:
        # Covers: bad signature, expired, wrong issuer, malformed token, etc.
        # Log the specific reason server-side, but return a generic 401 so we
        # don't hand an attacker details about why their token was rejected.
        logger.info("JWT verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid token")

    # Pydantic will raise if the required fields (sub/iss/exp/iat) are missing,
    # which would also surface as a 500 — acceptable since a token that passes
    # jose.decode but lacks these fields would be a Clerk-side bug.
    return ClerkClaims(**payload)


async def get_current_user_db(
    request: Request,
    claims: ClerkClaims = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Authenticated dependency that returns a `users` row (not raw claims).

    On the user's FIRST authenticated request we don't yet have a row — Clerk
    owns their identity, we just mirror it. The INSERT ... ON CONFLICT DO
    NOTHING pattern handles concurrency-safe upsert: if two requests arrive
    at once, only one insert wins, the other is a no-op, and both re-SELECT
    the same row.

    Note: email/name stay NULL here. Clerk session JWTs don't carry them;
    they're filled later by `POST /onboarding` (or by a Clerk Backend API
    lookup, not yet wired).
    """
    result = await db.execute(select(User).where(User.clerk_user_id == claims.sub))
    user = result.scalar_one_or_none()
    if user is not None:
        await _stamp_signin(request, db, user, claims)
        return user

    # Not found — try to insert. ON CONFLICT makes this safe under race.
    stmt = (
        pg_insert(User)
        .values(clerk_user_id=claims.sub)
        .on_conflict_do_nothing(index_elements=["clerk_user_id"])
    )
    await db.execute(stmt)
    await db.commit()

    # Re-SELECT: covers both "we just inserted" and "the other request did".
    result = await db.execute(select(User).where(User.clerk_user_id == claims.sub))
    user = result.scalar_one()
    await log_user_created(db, user, clerk_user_id=claims.sub)
    await _stamp_signin(request, db, user, claims)
    # TODO: backfill email/name via Clerk Backend API once CLERK_SECRET_KEY is used.
    return user


async def _stamp_signin(
    request: Request, db: AsyncSession, user: User, claims: ClerkClaims
) -> None:
    """Stamp request.state for downstream handlers and log the sign-in (deduped per Clerk session)."""
    request.state.user_id = user.id
    request.state.clerk_user_id = user.clerk_user_id
    if claims.sid:
        await log_user_signed_in(
            db, user, clerk_user_id=claims.sub, clerk_session_id=claims.sid
        )
