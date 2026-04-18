"""
POST /onboarding — fills the user's profile fields after sign-in.

Multipart form, because a PDF résumé is part of the submission. Fields:
  industry, target_role, experience_level, short_bio   (free-text / enum)
  email, name                                          (from Clerk on the client)
  resume_file                                          (application/pdf, ≤5 MB)

On success the backend parses the PDF with pdfplumber, sets all fields on
the caller's `users` row, and flips `completed_registration=True`. The row
is guaranteed to exist because `get_current_user_db` upserts on first call.

Idempotent: re-submitting overwrites fields. `completed_registration` stays
true.

Error codes:
  401 — missing / invalid bearer (handled upstream in `current_user`)
  413 — resume file exceeds 5 MB
  415 — non-PDF upload
  422 — PDF parsed but produced no text (image-only PDF, corrupt, etc.)
"""

from io import BytesIO

import pdfplumber
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.enums import ExperienceLevel
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.user import UserOut

router = APIRouter()


# 5 MiB cap. Read in chunks so a malicious multi-GB upload can't OOM us.
_MAX_RESUME_BYTES = 5 * 1024 * 1024
_CHUNK_SIZE = 1024 * 1024


async def _read_pdf_bounded(file: UploadFile) -> bytes:
    """Read the full upload into memory, aborting with 413 if it exceeds the cap."""
    buf = bytearray()
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > _MAX_RESUME_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Resume exceeds {_MAX_RESUME_BYTES // (1024 * 1024)} MB limit",
            )
    return bytes(buf)


def _extract_pdf_text(content: bytes) -> str:
    """Extract concatenated text from every page. Returns '' if nothing parses."""
    with pdfplumber.open(BytesIO(content)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(pages).strip()


@router.post("", response_model=UserOut)
async def onboarding(
    industry: str = Form(..., min_length=1, max_length=200),
    target_role: str = Form(..., min_length=1, max_length=200),
    experience_level: ExperienceLevel = Form(...),
    short_bio: str = Form(..., min_length=1, max_length=2000),
    email: EmailStr = Form(...),
    name: str | None = Form(None, max_length=200),
    resume_file: UploadFile = File(...),
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Content-type + extension sanity check. `content_type` can be spoofed by
    # the client, but combined with the extension check it's enough to rule
    # out obvious mistakes; pdfplumber will raise on genuinely malformed data.
    if resume_file.content_type != "application/pdf" or not (
        resume_file.filename or ""
    ).lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Resume must be a PDF",
        )

    content = await _read_pdf_bounded(resume_file)

    try:
        resume_text = _extract_pdf_text(content)
    except Exception as exc:  # pdfplumber raises a variety of internal errors
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse PDF: {exc}",
        )

    if not resume_text:
        # Image-only PDFs are a common failure mode — tell the user.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from PDF (image-only scan?)",
        )

    # Mutate the already-attached ORM row. commit() fires the
    # `set_updated_at()` trigger defined in migration 0001_init.
    user.email = email
    user.name = name
    user.industry = industry
    user.target_role = target_role
    user.experience_level = experience_level
    user.short_bio = short_bio
    user.resume_text = resume_text
    user.completed_registration = True

    await db.commit()
    await db.refresh(user)
    return user
