"""
POST /onboarding — fills the user's profile fields after sign-in.

Multipart form, because a PDF résumé may be part of the submission. Fields:
  industry, target_role, experience_level, short_bio   (free-text / enum)
  email, name                                          (from Clerk on the client)
  resume_file                                          (optional, application/pdf, ≤5 MB)
  resume_text_input                                    (optional, ≤5000 chars)
  skip_resume                                          (optional bool, wins over both)

Résumé source resolution, in precedence order:
  1. `skip_resume=true`    → stored as ""
  2. `resume_file`         → parsed with pdfplumber
  3. `resume_text_input`   → stored verbatim (empty string = explicit clear)
  4. none of the above     → existing `users.resume_text` is preserved

Cases (1)–(3) are what the onboarding wizard submits (its frontend validator
forces one of them). Case (4) is what the Personalize page submits when the
user edits other fields without touching the résumé section.

On success all profile fields are written to the caller's `users` row and
`completed_registration` flips to True. The row is guaranteed to exist
because `get_current_user_db` upserts on first call.

Idempotent: re-submitting overwrites fields. `completed_registration` stays
true.

Error codes:
  401 — missing / invalid bearer (handled upstream in `current_user`)
  409 — email already claimed by another `users` row
  413 — resume file exceeds 5 MB
  415 — non-PDF upload
  422 — PDF produced no text, declares too many pages, or parsing timed out
"""

import asyncio
import logging
from io import BytesIO

import pdfplumber
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import EmailStr
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.enums import ExperienceLevel
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.user import UserOut
from app.services._injection import contains_injection
from app.services.moderation import check_moderation

router = APIRouter()

logger = logging.getLogger(__name__)


# 5 MiB cap. Read in chunks so a malicious multi-GB upload can't OOM us.
_MAX_RESUME_BYTES = 5 * 1024 * 1024
_CHUNK_SIZE = 1024 * 1024

# A résumé is 1-3 pages. Cap at 4 so a PDF that *declares* thousands of pages
# (each one triggering pdfplumber's per-page layout analysis) is rejected up
# front, before any expensive text extraction runs. The page count is metadata
# the attacker controls independently of file size, so the byte cap alone
# doesn't bound it.
_MAX_RESUME_PAGES = 4

# Hard wall-clock bound on the parse itself. pdfminer (pdfplumber's engine) has
# no internal time/CPU budget, so a crafted 5 MiB file — e.g. a Flate-compressed
# content stream that decompresses to hundreds of MB of operators — can pin a
# thread for a long time. The timeout bounds the *request*; see the note at the
# call site about the orphaned worker thread.
_PDF_PARSE_TIMEOUT_S = 10.0


class _PdfTooManyPagesError(Exception):
    """Raised by `_extract_pdf_text` when the PDF declares more pages than a
    résumé plausibly has. Lets the caller return a specific 422 (distinct from
    a generic parse failure) without making the parser HTTP-aware."""


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
    """Extract concatenated text from every page. Returns '' if nothing parses.

    Raises `_PdfTooManyPagesError` if the document declares more than
    `_MAX_RESUME_PAGES` pages. The page-count check runs *before* the per-page
    `extract_text()` loop (which does the expensive layout analysis), so a
    page-explosion bomb is rejected cheaply — only the page tree is resolved.
    """
    with pdfplumber.open(BytesIO(content)) as pdf:
        page_count = len(pdf.pages)
        if page_count > _MAX_RESUME_PAGES:
            raise _PdfTooManyPagesError(page_count)
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
    resume_file: UploadFile | None = File(None),
    resume_text_input: str | None = Form(None, max_length=5000),
    skip_resume: bool = Form(False),
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Empty UploadFile entries arrive with no filename — treat those as absent.
    has_file = resume_file is not None and bool(resume_file.filename)
    # Distinguish "field omitted" (preserve existing) from "field sent as empty
    # string" (explicit clear). Needed by the Personalize page, which can
    # submit without touching résumé input; FastAPI keeps `None` vs `""`
    # distinct for `Form(None, ...)` multipart fields.
    text_sent = resume_text_input is not None

    if skip_resume:
        final_resume_text = ""
    elif has_file:
        # Content-type + extension sanity check. `content_type` can be spoofed
        # by the client, but combined with the extension check it's enough to
        # rule out obvious mistakes; pdfplumber will raise on genuinely
        # malformed data.
        assert resume_file is not None  # narrowed by has_file
        if resume_file.content_type != "application/pdf" or not (
            resume_file.filename or ""
        ).lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Resume must be a PDF",
            )

        content = await _read_pdf_bounded(resume_file)

        try:
            # pdfplumber parsing is synchronous CPU/IO-bound work; run it off
            # the event loop so a large résumé doesn't stall other requests on
            # this worker for the duration of the parse. The wait_for bounds how
            # long we'll wait — a parser-bomb PDF can't pin the request forever.
            #
            # Caveat: wait_for cancels the *await*, freeing the event loop, but
            # it can't kill the worker thread — pdfminer keeps running until it
            # returns. That orphaned thread is acceptable here because (a) the
            # page cap rejects the page-explosion vector before any layout work,
            # and (b) the 5 MiB byte cap bounds the worst-case single parse. The
            # timeout's job is to stop request pile-up, not to reclaim the CPU.
            extracted_text = await asyncio.wait_for(
                asyncio.to_thread(_extract_pdf_text, content),
                timeout=_PDF_PARSE_TIMEOUT_S,
            )
        except _PdfTooManyPagesError as e:
            # Distinct, actionable message — the user just needs a shorter file.
            logger.info("Resume PDF rejected: %s pages (max %s)", e, _MAX_RESUME_PAGES)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Resume has too many pages (max {_MAX_RESUME_PAGES}). "
                    "Please upload a shorter PDF."
                ),
            )
        except (asyncio.TimeoutError, TimeoutError):
            # Treat a slow parse as a bad file rather than a 500. Log it so we
            # can spot a real abuse pattern; keep the client message generic.
            logger.warning(
                "PDF parse exceeded %ss during onboarding", _PDF_PARSE_TIMEOUT_S
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not process the uploaded PDF in time. Please try a simpler file.",
            )
        except Exception:  # pdfplumber raises a variety of internal errors
            # Log the parser error server-side; return a generic message so
            # we don't leak pdfplumber/pdfminer internals to the client.
            logger.warning("PDF parse failed during onboarding", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not parse the uploaded PDF. Please try a different file.",
            )

        if not extracted_text:
            # Image-only PDFs are a common failure mode — tell the user.
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not extract text from PDF (image-only scan?)",
            )

        final_resume_text = extracted_text
    elif text_sent:
        # Empty string here is an explicit clear from the Personalize page.
        final_resume_text = (resume_text_input or "").strip()
    else:
        # No résumé signal at all — preserve whatever is already on the row.
        # Onboarding's frontend validator forces one of {file, text, skip},
        # so this branch is only reached from Personalize edits that don't
        # touch the résumé section.
        final_resume_text = user.resume_text or ""

    # Deterministic prompt-injection gate on the two long free-text fields that
    # later feed LLM prompts. Free (no network) so it runs BEFORE moderation.
    # This is the AUTHORITATIVE check for PDF-extracted résumé text, which the
    # client can't inspect to validate. bio + pasted résumé are also gated
    # client-side for instant feedback.
    if contains_injection(short_bio) or contains_injection(final_resume_text):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "One of your profile fields contains content that violates our "
                "usage policy. Please revise and resubmit."
            ),
        )

    # Moderation pre-check on every free-text field that will later feed
    # an LLM prompt (opening question / evaluator / follow-up all consume
    # the stored resume_text, short_bio, industry, target_role). Blocking
    # here prevents a bad profile from poisoning every subsequent session
    # and racking up policy hits on our API keys.
    moderation_fields = (
        ("onboarding.industry", industry),
        ("onboarding.target_role", target_role),
        ("onboarding.short_bio", short_bio),
        ("onboarding.resume_text", final_resume_text),
    )
    # The fields are independent, so moderate them concurrently. Empty fields
    # short-circuit to a safe verdict with no network call, and each
    # check_moderation logs its incident in its own short-lived session, so the
    # request `db` is never used concurrently.
    checks = await asyncio.gather(*(
        check_moderation(value, user=user, db=db, metadata={"source": source})
        for source, value in moderation_fields
    ))
    if any(check.flagged for check in checks):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "One of your profile fields contains content that "
                "violates our usage policy. Please revise and resubmit."
            ),
        )

    # The opening-question avoid-list is keyed on the candidate's
    # role/industry/experience-level "shape" — once any of those change, the
    # cached recent questions stop being relevant context, so we reset them.
    # Captured BEFORE the assignments below. First-time onboarding has these
    # at None, so this evaluates True and harmlessly clears an empty list.
    profile_drivers_changed = (
        user.industry != industry
        or user.target_role != target_role
        or user.experience_level != experience_level
    )

    # Mutate the already-attached ORM row. commit() fires the
    # `set_updated_at()` trigger defined in migration 0001_init.
    user.email = email
    user.name = name
    user.industry = industry
    user.target_role = target_role
    user.experience_level = experience_level
    user.short_bio = short_bio
    user.resume_text = final_resume_text
    user.completed_registration = True
    if profile_drivers_changed:
        user.recent_opening_questions = []

    try:
        await db.commit()
    except IntegrityError:
        # The only UNIQUE column this endpoint writes is `users.email`, so an
        # IntegrityError here means another row already claims this address —
        # typically a leftover row from a deleted Clerk account whose
        # `user.deleted` webhook didn't land. Roll back so the session is
        # usable during dependency teardown, and surface a clean 409 instead
        # of letting the raw error bubble up as an opaque 500 (which, lacking
        # CORS headers, the browser misreports as a CORS failure).
        await db.rollback()
        logger.warning("Onboarding email collision for %s", email)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "An account with this email address already exists. "
                "Sign in with your original method (email & password, or Google)."
            ),
        )
    await db.refresh(user)
    return user
