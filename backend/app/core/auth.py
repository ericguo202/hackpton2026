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

from typing import Optional

import httpx
from fastapi import Header, HTTPException, status
from jose import jwt, JWTError
from pydantic import BaseModel

from app.core.config import settings


# Module-level JWKS cache. Clerk rotates signing keys rarely (on the order of
# months), so fetching once per process is fine for a hackathon. If verification
# starts failing with "Unknown signing key" in production, invalidate this cache
# or add a TTL + refetch-on-miss fallback.
_jwks_cache: Optional[dict] = None


async def _get_jwks() -> dict:
    """Fetch (and memoize) Clerk's public JWKS document."""
    global _jwks_cache
    if _jwks_cache is None:
        # rstrip("/") defends against issuers configured with a trailing slash
        # that would produce a double-slash URL and a 404 from Clerk.
        issuer = settings.CLERK_JWT_ISSUER.rstrip("/")
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{issuer}/.well-known/jwks.json")
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


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
    """

    sub: str
    iss: str
    exp: int
    iat: int
    sid: Optional[str] = None
    azp: Optional[str] = None


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
        key = next((k for k in jwks["keys"] if k["kid"] == header.get("kid")), None)
        if key is None:
            # Either the token wasn't signed by this Clerk instance, or Clerk
            # rotated keys and our cache is stale.
            raise HTTPException(status_code=401, detail="Unknown signing key")

        # 4. Full verification: RS256 signature + issuer + exp + nbf/iat.
        #    - algorithms=["RS256"] pins the algorithm so an attacker can't
        #      downgrade to `none` or HMAC with the public key as the secret.
        #    - issuer= makes python-jose enforce the `iss` claim equals ours.
        #    - verify_aud=False: Clerk session tokens don't set `aud` by default
        #      unless you configure a custom JWT template with an audience.
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.CLERK_JWT_ISSUER.rstrip("/"),
            options={"verify_aud": False},
        )
    except JWTError as e:
        # Covers: bad signature, expired, wrong issuer, malformed token, etc.
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    # Pydantic will raise if the required fields (sub/iss/exp/iat) are missing,
    # which would also surface as a 500 — acceptable since a token that passes
    # jose.decode but lacks these fields would be a Clerk-side bug.
    return ClerkClaims(**payload)
