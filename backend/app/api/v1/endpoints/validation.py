"""Autocomplete endpoints for the industry and target-role profile inputs."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.validation import SuggestionsOut
from app.services.profile_validation import (
    suggest_industries,
    suggest_roles,
)
from app.services.rate_limit import rate_limited

router = APIRouter()

# Both autocomplete routes share one per-user quota: they fan out to moderation
# + LLM calls on each keystroke-debounced request, and a token-holder could
# otherwise script them in a loop for unbounded third-party spend.
_autocomplete_limit = Depends(rate_limited("autocomplete"))


@router.get(
    "/industries",
    response_model=SuggestionsOut,
    dependencies=[_autocomplete_limit],
)
async def suggest_industries_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SuggestionsOut:
    return await suggest_industries(q, user=user, db=db)


@router.get(
    "/roles",
    response_model=SuggestionsOut,
    dependencies=[_autocomplete_limit],
)
async def suggest_roles_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    industry: str | None = Query(None, max_length=200),
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SuggestionsOut:
    return await suggest_roles(q, industry, user=user, db=db)
