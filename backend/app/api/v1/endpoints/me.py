"""
/me endpoint — the auth + upsert smoke test.

`get_current_user_db` both verifies the Clerk JWT and ensures a `users` row
exists for the caller (upsert on first call). The handler runs only for
authenticated users and returns the full DB row as `UserOut`.

Expected behaviors:
  - no Authorization header            -> 401 "Missing bearer token"
  - Authorization: Bearer <garbage>    -> 401 "Invalid token: ..."
  - Authorization: Bearer <valid JWT>  -> 200 UserOut
"""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user_db
from app.db.models.user import User
from app.schemas.user import UserOut

router = APIRouter()


@router.get("", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user_db)) -> User:
    return user
