"""
/me endpoint — the T+0 "is auth working?" smoke test.

Any route that `Depends(current_user)` is automatically protected: FastAPI runs
the dependency before the handler, and a 401 raised inside the dependency
short-circuits the request. The handler only ever runs with verified claims.

Expected behaviors (from the CLAUDE.md verification checklist):
  - no Authorization header            -> 401 "Missing bearer token"
  - Authorization: Bearer <garbage>    -> 401 "Invalid token: ..."
  - Authorization: Bearer <valid JWT>  -> 200 {"clerk_user_id": "user_..."}
"""

from fastapi import APIRouter, Depends

from app.core.auth import ClerkClaims, current_user

router = APIRouter()


@router.get("")
async def get_me(claims: ClerkClaims = Depends(current_user)):
    # `claims.sub` is Clerk's stable user id (e.g. "user_2abc..."). Once the
    # users table exists, this is the column we'll join on / upsert by.
    return {"clerk_user_id": claims.sub}
