"""
v1 API router aggregator.

Each feature lives in its own module under `endpoints/` and exposes a `router`
(an `APIRouter`). This file composes them under a common `/api/v1` prefix,
which is itself mounted by `main.py`.

Adding a new route group is a three-step ritual:
  1. Create `endpoints/<name>.py` with `router = APIRouter()`
  2. Import it here
  3. `api_router.include_router(<name>.router, prefix="/<name>", tags=["<name>"])`
     - `prefix` is the URL segment (e.g. "/sessions" → /api/v1/sessions/...)
     - `tags` groups the routes in the auto-generated OpenAPI docs at /docs
"""

from fastapi import APIRouter
from app.api.v1.endpoints import health, me, onboarding

api_router = APIRouter()

# Unauthenticated liveness + DB probe — used by Docker healthchecks and us.
api_router.include_router(health.router, prefix="/health", tags=["health"])

# Protected. GET /api/v1/me returns the caller's Clerk user id.
# Auth is enforced inside the endpoint via Depends(current_user), NOT here.
api_router.include_router(me.router, prefix="/me", tags=["me"])

# Protected. POST /api/v1/onboarding fills in profile fields + résumé.
api_router.include_router(
    onboarding.router, prefix="/onboarding", tags=["onboarding"]
)
