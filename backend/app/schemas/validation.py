"""Wire models for deterministic role/company validation."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.services._field_prompts import FieldCategory


ValidationStatus = Literal["valid", "needs_confirmation", "invalid", "unavailable"]


class RoleAlternativeOut(BaseModel):
    title: str
    soc_code: str | None = None
    confidence: float


class RoleValidationOut(BaseModel):
    status: ValidationStatus
    user_input: str
    canonical_title: str | None = None
    soc_code: str | None = None
    category: FieldCategory | None = None
    source: str | None = None
    confidence: float = 0.0
    alternatives: list[RoleAlternativeOut] = []
    message: str | None = None


class IndustryAlternativeOut(BaseModel):
    name: str
    confidence: float


class IndustryValidationOut(BaseModel):
    status: ValidationStatus
    user_input: str
    canonical_industry: str | None = None
    category: FieldCategory | None = None
    source: str | None = None
    confidence: float = 0.0
    alternatives: list[IndustryAlternativeOut] = []
    message: str | None = None


class CompanyAlternativeOut(BaseModel):
    name: str
    domain: str | None = None
    brand_id: str | None = None
    confidence: float


class CompanyValidationOut(BaseModel):
    status: ValidationStatus
    user_input: str
    canonical_name: str | None = None
    domain: str | None = None
    brand_id: str | None = None
    source: str | None = None
    confidence: float = 0.0
    alternatives: list[CompanyAlternativeOut] = []
    message: str | None = None
