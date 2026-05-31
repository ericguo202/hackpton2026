"""Validation endpoints for profile and session setup inputs."""

from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user_db
from app.db.models.user import User
from app.schemas.validation import (
    CompanyValidationOut,
    IndustryValidationOut,
    RoleValidationOut,
)
from app.services.profile_validation import (
    validate_company,
    validate_industry,
    validate_role,
)

router = APIRouter()


@router.get("/roles", response_model=RoleValidationOut)
async def validate_role_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    _: User = Depends(get_current_user_db),
) -> RoleValidationOut:
    return await validate_role(q)


@router.get("/industries", response_model=IndustryValidationOut)
async def validate_industry_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    _: User = Depends(get_current_user_db),
) -> IndustryValidationOut:
    return await validate_industry(q)


@router.get("/companies", response_model=CompanyValidationOut)
async def validate_company_endpoint(
    q: str = Query(..., min_length=1, max_length=200),
    _: User = Depends(get_current_user_db),
) -> CompanyValidationOut:
    return await validate_company(q)
