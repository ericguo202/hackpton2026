"""Autocomplete endpoints for the industry and target-role profile inputs."""

from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user_db
from app.db.models.user import User
from app.schemas.validation import SuggestionsOut
from app.services.profile_validation import (
    suggest_industries,
    suggest_roles,
)

router = APIRouter()


@router.get("/industries", response_model=SuggestionsOut)
async def suggest_industries_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    _: User = Depends(get_current_user_db),
) -> SuggestionsOut:
    return await suggest_industries(q)


@router.get("/roles", response_model=SuggestionsOut)
async def suggest_roles_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    industry: str | None = Query(None, max_length=200),
    _: User = Depends(get_current_user_db),
) -> SuggestionsOut:
    return await suggest_roles(q, industry)
