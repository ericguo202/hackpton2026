"""
Sessions endpoints.

POST /api/v1/sessions             — start a new mock interview.
POST /api/v1/sessions/{id}/turns  — submit an answer audio blob for evaluation.
GET  /api/v1/sessions             — list the caller's completed sessions.
GET  /api/v1/sessions/{id}        — full session detail (session + turns).
"""

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.auth import get_current_user_db
from app.db.models.enums import (
    ExperienceLevel,
    QuestionCategory,
    SessionStatus,
    UserTier,
)
from app.db.models.custom_question import CustomQuestion
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.session_metrics import SessionMetrics
from app.db.models.user import User
from app.db.session import AsyncSessionLocal, get_db
from app.schemas.session import (
    CompanyBriefOut,
    DimensionAverages,
    ScoresOut,
    SessionCreateIn,
    SessionCreateOut,
    SessionDetailOut,
    SessionEndOut,
    SessionListItem,
    TurnOut,
    TurnSubmitOut,
)
from app.services import eval_registry
from app.services.company_research import (
    CompanyBrief,
    CompanyNotFoundError,
    DEFAULT_CATEGORY,
    research_company,
)
from app.services._field_categories import FieldCategory
from app.services._injection import contains_injection
from app.services.daily_limit import (
    enforce_session_start_limits,
    increment_turns,
    increment_week,
)
from app.services.coaching import generate_next_take
from app.services.delivery_consent import has_active_delivery_analytics_consent
from app.services.evaluator import EVAL_MODEL, EvaluatorOutput, evaluate_turn
from app.services.filler_words import (
    count_filler_words,
    count_words,
    filler_rate_pct,
    speaking_pace_wpm,
)
from app.services.followup import (
    generate_followup_transition,
    should_continue_followup,
    _tts_text,
)
from app.services.incidents import (
    log_error,
    log_injection_detected,
    log_interview_session_started,
    log_jd_mismatch_acknowledged,
)
from app.services.job_description import (
    check_job_description_match,
    looks_like_gibberish,
)
from app.services.moderation import check_moderation
from app.services._category_weights import draw_opening_category
from app.services.opening_question import generate_opening_question
from app.services.stt import transcribe_audio
from app.services.tts import DEFAULT_SPEED, synthesize_speech
from app.services.voice_pool import resolve_speed, resolve_voice, voice_for_session

logger = logging.getLogger(__name__)

router = APIRouter()
_finalize_tasks: set[asyncio.Task[None]] = set()
_finalizing_sessions: set[UUID] = set()

# How long after the final answer was persisted we wait before the lazy
# reaper in `get_session` is allowed to re-spawn finalization. Comfortably
# longer than a normal finalize (turn-1 drain + ~30-40s evaluator) so a
# still-running finalizer is never raced; the per-session dedup set below is
# the primary guard within a process, this grace covers the multi-worker case.
_FINALIZE_REAP_AFTER = timedelta(seconds=90)


def _spawn_finalize(
    *,
    session_id: UUID,
    final_turn_id: UUID,
    category: FieldCategory | None,
    experience_level: ExperienceLevel | None,
    jd_summary: list[str] | None = None,
) -> None:
    """Spawn background finalization, deduped per session within this process.

    Holds a strong reference to the task (so it isn't GC'd mid-flight) and
    records the session id so the lazy reaper in `get_session` won't start a
    second, concurrent finalizer for a session this worker is already
    finishing — which would otherwise duplicate the evaluator spend and race
    the metrics upsert. (Usage counters are charged per answered turn in
    `submit_turn` and are unaffected by a double finalize.)
    """
    if session_id in _finalizing_sessions:
        return
    _finalizing_sessions.add(session_id)
    task = asyncio.create_task(
        _run_background_finalize(
            session_id=session_id,
            final_turn_id=final_turn_id,
            category=category,
            experience_level=experience_level,
            jd_summary=jd_summary,
        ),
        name=f"finalize-session-{session_id}",
    )
    _finalize_tasks.add(task)

    def _done(t: asyncio.Task[None]) -> None:
        _finalize_tasks.discard(t)
        _finalizing_sessions.discard(session_id)

    task.add_done_callback(_done)


# ── session creation ──────────────────────────────────────────────────────────

async def _persist_session_and_turn(
    db: AsyncSession,
    user: User,
    company: str,
    job_title: str,
    company_summary: str,
    opening_q: str,
    session_id: UUID,
    voice_id: str,
    experience_level: ExperienceLevel | None,
    num_turns: int = 2,
    roll_recent: bool = True,
    saved_question_id: UUID | None = None,
    speech_speed: float = DEFAULT_SPEED,
    question_category: QuestionCategory = QuestionCategory.experience_star,
    calibrated_mix: bool = False,
) -> UUID:
    """INSERT the session row + turn 1 atomically; return session.id.

    `session_id` is generated by the caller so the per-session voice
    selection (in `voice_pool`) can run BEFORE the row exists in the
    DB — this lets us TTS the opening question in parallel with the
    INSERT instead of serializing the two. `voice_id` is the resolved
    voice (either picked by the candidate or the deterministic
    fallback) and is persisted on the row so turn 2 reads the same
    value without re-deriving.

    `experience_level` is frozen onto the session here (from the user's live
    level on a fresh session, or a saved question's frozen level on
    re-practice) so `submit_turn` never reads the mutable user row.

    `roll_recent` gates the `recent_opening_questions` avoid-list write: True
    for fresh sessions (don't repeat questions across sessions), False for
    re-practice (the repeat is the whole point). `saved_question_id` links the
    session to a saved question at creation (re-practice path).
    """
    session = InterviewSession(
        id=session_id,
        user_id=user.id,
        company=company,
        job_title=job_title,
        company_summary=company_summary,
        status=SessionStatus.in_progress,
        started_at=func.now(),
        voice_id=voice_id,
        experience_level=experience_level,
        num_turns=num_turns,
        saved_question_id=saved_question_id,
        speech_speed=speech_speed,
        calibrated_mix=calibrated_mix,
    )
    db.add(session)
    await db.flush()

    turn = InterviewTurn(
        session_id=session.id,
        turn_number=1,
        question_text=opening_q,
        is_followup=False,
        # The session's chosen question FORM (single-category per session).
        # Defaults to Experience/STAR for callers that don't pass it (re-practice,
        # custom questions). Every later turn inherits this in submit_turn.
        question_category=question_category,
    )
    db.add(turn)

    # Roll this opening question into the avoid-list, newest-first, capped
    # at 3. Reassigned (not mutated in place) so SQLAlchemy dirty-tracking
    # picks it up; rides the same commit as the session + turn 1 INSERT.
    # Skipped on re-practice — that flow deliberately wants the same question.
    if roll_recent:
        user.recent_opening_questions = (
            [opening_q] + (user.recent_opening_questions or [])
        )[:3]

    await db.commit()
    await db.refresh(session)
    return session.id


@router.post("", response_model=SessionCreateOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreateIn,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionCreateOut:
    # Persist the client's latest timezone and enforce both free-tier caps
    # BEFORE moderation / research / TTS so a rate-limited request never spends
    # Serper, OpenRouter, or ElevenLabs credits. The counters themselves advance
    # in `submit_turn` — once per answered turn, plus the weekly session slot on
    # turn 1 — so this is a pre-check, not a reservation.
    #
    # The return value is the session length the caller can actually afford: a
    # user with fewer turns left today than they asked for gets a SHORTENED
    # session rather than a 429 (only < 2 turns left is refused). Everything
    # downstream must read `effective_num_turns`, never `body.num_turns` — the
    # value is echoed on the response, and Practice renders its "Question X of
    # N" from that echo, so a missed substitution shows up as a session that
    # ends early with no explanation.
    effective_num_turns = await enforce_session_start_limits(
        db, user, timezone=body.timezone, requested_turns=body.num_turns
    )

    # Deterministic prompt-injection gate on the two user-authored inputs that
    # feed company research + every downstream prompt. Free (no network) so it
    # runs BEFORE the billed moderation call below — an injected company /
    # job-title never reaches OpenAI moderation, Serper, OpenRouter, or
    # ElevenLabs. The delimiters + untrusted-data clause in `research_company`
    # are the recall layer for subtler attempts this high-precision regex skips.
    # STRICT gate (these are not interview answers): company + job_title are
    # short structured fields (also block a bare "API key"); the pasted job
    # description is long free-text (tolerates "API key rotation" prose). The
    # interview-turn transcript gate in `submit_turn` stays on the relaxed regex.
    if (
        contains_injection(body.company, strict=True, short_field=True)
        or contains_injection(body.job_title, strict=True, short_field=True)
        or contains_injection(body.job_description, strict=True)
    ):
        logger.info(
            "Session-create rejected by injection gate clerk_user_id=%s",
            user.clerk_user_id,
        )
        await log_injection_detected(
            source="sessions.company",
            text=(
                f"company={body.company!r} job_title={body.job_title!r} "
                f"job_description={body.job_description!r}"
            ),
            user=user,
            db=db,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Input contains content that violates our usage policy.",
        )

    # Resolve an optional custom question up front (ownership 404) so an invalid
    # id fails fast — before any billed moderation / research / TTS spend. When
    # present it replaces the opening-question LLM call below; research still
    # runs so the follow-up + evaluator stay field-tailored.
    custom_question: CustomQuestion | None = None
    if body.custom_question_id is not None:
        custom_question = await db.get(CustomQuestion, body.custom_question_id)
        if custom_question is None or custom_question.user_id != user.id:
            raise HTTPException(
                status_code=404, detail="Custom question not found"
            )

    # Conservative gibberish gate on the pasted job description (only when one
    # was supplied). Free / local, so it runs before any billed call. A real
    # posting always passes; only obvious keysmash / symbol-soup is rejected.
    job_description = (body.job_description or "").strip()
    if job_description and looks_like_gibberish(job_description):
        logger.info(
            "Session-create rejected by JD gibberish gate clerk_user_id=%s",
            user.clerk_user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That job description doesn't look valid. Please paste a real posting.",
        )

    # Pre-flight moderation on the two user-authored string inputs that
    # feed downstream LLM prompts. Blocking HERE means the content never
    # reaches Serper, OpenRouter, or ElevenLabs — so a malicious company
    # / job-title value can't cost us API-key reputation.
    # `company` is freshly typed in the setup form each session, so it always
    # needs moderation. `job_title` is NOT editable there — the frontend sends
    # the profile's `target_role`, already moderated at onboarding — so only
    # re-moderate it when a (direct-API) caller sends something other than that
    # vetted value. The remaining checks are independent, so run them
    # concurrently; each logs its incident in its own short-lived session, so the
    # request `db` is never touched concurrently.
    moderation_targets = [("sessions.company", body.company)]
    # `job_title` is the profile's active role by default, but a multi-role user
    # can start a session under any of their declared roles — all of which were
    # moderated at onboarding. Skip re-moderation when it matches ANY stored role.
    vetted_roles = user.target_roles or ([user.target_role] if user.target_role else [])
    if body.job_title not in vetted_roles:
        moderation_targets.append(("sessions.job_title", body.job_title))
    # The pasted job description is freshly user-supplied each session, so it
    # always needs moderation when present.
    if job_description:
        moderation_targets.append(("sessions.job_description", job_description))
    checks = await asyncio.gather(*(
        check_moderation(value, user=user, db=db, metadata={"source": source})
        for source, value in moderation_targets
    ))
    flagged = [
        (source, check.categories)
        for (source, _), check in zip(moderation_targets, checks)
        if check.flagged
    ]
    if flagged:
        logger.warning(
            "Session-create rejected by moderation clerk_user_id=%s flagged=%s",
            user.clerk_user_id, flagged,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Input contains content that violates our usage policy.",
        )

    # Consistency guard: when a job description is pasted, confirm it lines up
    # with the candidate's declared industry / role / company before spending
    # any research credits. A clear mismatch (e.g. an IB posting against a SWE
    # profile) would confuse research + the opening-question generator, so we
    # block with a 409 and let the user explicitly continue (re-submitting with
    # `acknowledge_mismatch=true`). The check itself fails open — an LLM outage
    # never blocks a legitimate session.
    if job_description and not body.acknowledge_mismatch:
        match = await check_job_description_match(
            company=body.company,
            job_title=body.job_title,
            industry=user.industry,
            job_description=job_description,
        )
        if not match.match:
            logger.info(
                "Session-create JD mismatch clerk_user_id=%s reason=%r",
                user.clerk_user_id, match.reason,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "job_description_mismatch",
                    "message": (
                        match.reason
                        or "Your target role, industry, or company doesn't "
                        "seem to match this job description."
                    ),
                },
            )
    elif job_description and body.acknowledge_mismatch:
        # The user re-submitted to override a flagged mismatch. Log it as a
        # warning for abuse visibility (the daily session cap bounds the actual
        # spend); the match LLM's reason isn't re-derived on this path.
        logger.info(
            "Session-create JD mismatch acknowledged clerk_user_id=%s",
            user.clerk_user_id,
        )
        await log_jd_mismatch_acknowledged(
            user=user,
            job_description=job_description,
            company=body.company,
            job_title=body.job_title,
            db=db,
        )

    # "Recommended Mix" mode: each story-block opening draws a calibrated category
    # from the user's level + researched field. A custom question only ever fills
    # the FIRST opening (its own classified category), so every LATER opening in a
    # custom-question session draws from the Mix too — hence Mix is forced on.
    # (`body.question_category` is ignored for a custom question; the frontend
    # disables the picker and stops sending it.)
    mixed_mode = body.calibrated_mix or custom_question is not None

    # The category used to select the RESEARCH variant. The situational research
    # variant (accurate company principles + situational themes) is picked BEFORE
    # research, so it needs a category up front. A custom question is already
    # classified, so its stored category selects the variant — a situational
    # custom question gets the situational brief. In plain Mix mode the field
    # category (which drives the turn-1 draw) only exists AFTER research, so we
    # can't pre-select the situational variant — Mix uses the standard/behavioral
    # brief (see plan "Known limitations").
    research_category = (
        custom_question.question_category
        if custom_question is not None
        else (
            QuestionCategory.experience_star
            if mixed_mode
            else body.question_category
        )
    )

    try:
        brief = await research_company(
            body.company,
            body.job_title,
            user.experience_level,
            job_description=job_description or None,
            question_category=research_category,
        )
    except CompanyNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="We couldn't find that company. Please check the spelling.",
        )
    logger.info(
        "Session research complete: company=%r job_title=%r category=%r",
        body.company, body.job_title, brief.category,
    )

    # The FORM stamped on turn 1. A custom question always wins — turn 1 IS that
    # question, so it carries the category it was classified as. Otherwise, in
    # Mix mode, drawn from the calibrated weights now that the field category is
    # known (turn 1 of a >2-turn session carries the "tell me about yourself" M&F
    # bias); else the picker's single category. Later openings redraw in
    # submit_turn — for a custom session, turn 1's category is already in the
    # no-repeat `used` set there, so the rest of the interview varies off it.
    if mixed_mode and custom_question is None:
        question_category = draw_opening_category(
            field=brief.category,
            level=user.experience_level,
            # The clamped length, not the requested one: the turn-1 M&F bias
            # only applies to sessions longer than 2 turns, so a request for 8
            # clamped down to 2 must draw under the 2-turn exception.
            num_turns=effective_num_turns,
            used=set(),
            is_first_opening=True,
        )
    else:
        question_category = research_category

    if custom_question is not None:
        # The candidate picked their own question — skip the opening-question
        # LLM call entirely and use the (already-screened) custom text verbatim.
        opening_q = custom_question.question_text
    else:
        # Pass the candidate's recent opening questions (already loaded on the
        # user row by get_current_user_db — no extra query) as an avoid-list so
        # the generator doesn't repeat near-identical questions across sessions.
        opening_q = await generate_opening_question(
            user, brief, body.job_title,
            recent_questions=user.recent_opening_questions,
            question_category=question_category,
        )

    # Generate the session UUID up front so the voice can be resolved
    # before the row hits the DB. This lets TTS and the INSERT run in
    # parallel instead of waiting on the DB to hand back a
    # server-generated UUID.
    session_id = uuid.uuid4()
    # Honor the candidate's picker choice when valid, else a deterministic
    # per-session voice (see `resolve_voice`). The resolved voice is persisted
    # on the session row below so every follow-up TTS reads the same value.
    voice_id = resolve_voice(body.voice_id, session_id)
    # Turn the "Normal"/"Slower" toggle into this voice's tuned speed now that
    # the voice is resolved (works for the "Surprise me" path, where the
    # frontend couldn't know the voice). The resolved float is persisted and
    # reused verbatim by turn 2's follow-up TTS.
    speech_speed = resolve_speed(voice_id, body.speech_pace)

    audio_url, _ = await asyncio.gather(
        synthesize_speech(opening_q, voice_id=voice_id, speed=speech_speed),
        _persist_session_and_turn(
            db,
            user,
            company=body.company,
            job_title=body.job_title,
            company_summary=brief.model_dump_json(),
            opening_q=opening_q,
            session_id=session_id,
            voice_id=voice_id,
            experience_level=user.experience_level,
            num_turns=effective_num_turns,
            # A custom question is a deliberate, reusable pick — don't push it
            # into the generation avoid-list (it isn't a generated question).
            roll_recent=custom_question is None,
            # Persist the resolved pace so turn 2's TTS matches turn 1.
            speech_speed=speech_speed,
            # Stamp turn 1 with its category — the picker's choice, a Mix draw,
            # or the custom question's own classified category.
            question_category=question_category,
            calibrated_mix=mixed_mode,
        ),
    )
    await log_interview_session_started(
        db,
        user,
        session_id=session_id,
        metadata={
            "company": body.company,
            "job_title": body.job_title,
            "num_turns": effective_num_turns,
            "requested_num_turns": body.num_turns,
            "custom_question": custom_question is not None,
        },
    )

    return SessionCreateOut(
        session_id=session_id,
        summary=CompanyBriefOut(**brief.model_dump()),
        first_question=opening_q,
        first_question_category=question_category.value,
        num_turns=effective_num_turns,
        calibrated_mix=mixed_mode,
        first_question_audio_url=audio_url,
    )


# ── turn submission ───────────────────────────────────────────────────────────

# Hard cap on the uploaded answer audio. A 5-minute Opus/WebM clip is well
# under this (the frontend also auto-stops recording at the 5:00 mark), so the
# cap only ever trips on a malformed or malicious upload. Read in 1 MiB chunks
# and abort with 413 BEFORE the bytes can exhaust worker memory or get
# forwarded to ElevenLabs STT (burning quota). Mirrors onboarding's bounded
# résumé read (`_read_pdf_bounded`).
_MAX_AUDIO_BYTES = 50 * 1024 * 1024
_AUDIO_CHUNK_SIZE = 1024 * 1024
_FALLBACK_CLARIFICATION_QUESTION = (
    "Tell me about one specific work or school situation, what you did, and what happened."
)
# Matched at the START of the utterance (after leading filler is stripped), so
# these are clarification *openers*, not substrings. The modal branch is
# compositional — "(can|could|would|will) [you] [please] <verb>" — so an
# interposed "you"/"please" ("can you please clarify that") doesn't break the
# match the way a fixed "can you clarify" literal would.
_CLARIFICATION_RE = re.compile(
    r"(?:"
    r"(?:can|could|would|will) (?:you )?(?:please )?"
    r"(?:clarify|be more (?:explicit|specific)|"
    r"explain (?:the |that |your )?question|repeat (?:the |that )?question)"
    r"|please clarify"
    r"|clarify (?:the question|that)"
    r"|what (?:do|did) you mean"
    r"|what are you asking"
    r"|be more (?:explicit|specific)"
    r"|challenge regarding what"
    r")\b",
    re.IGNORECASE,
)
# Politeness/filler the candidate might utter *before* the clarification
# proper ("uh, sorry. can you clarify that, please?"). Stripped from the front
# so the anchored match below still fires, without opening the door to
# mid-sentence matches. The trailing separator class swallows any run of
# whitespace/punctuation between filler tokens — including the sentence period
# in "sorry. can you..." — so a filler word ending a clause doesn't block the
# next token from being recognized.
_CLARIFICATION_LEADING_FILLER_RE = re.compile(
    r"^(?:"
    r"sorry|please|excuse me|um+|uh+|uhm+|er+|erm+|hmm+|hey|hi|wait|so|yeah|"
    r"yep|well|oh|okay|ok|like|but|and|i'?m sorry|my bad"
    r")\b[\s,.;:!?\-]*",
    re.IGNORECASE,
)


def _is_clarification_request(transcript: str) -> bool:
    """Conservative detector for explicit clarification requests only.

    The clarification phrase must *lead* the utterance (after stripping any
    leading politeness/filler), not merely appear somewhere inside it. This is
    what separates a real "What do you mean?" from a genuine — if short — answer
    that narrates one ("I asked my manager what do you mean by scalable, then I
    built it."), which should be scored normally, not silently re-asked.
    """
    cleaned = " ".join((transcript or "").strip().lower().split())
    if not cleaned or len(cleaned) > 180:
        return False
    prev = None
    while prev != cleaned:
        prev = cleaned
        cleaned = _CLARIFICATION_LEADING_FILLER_RE.sub("", cleaned, count=1)
    return bool(_CLARIFICATION_RE.match(cleaned))


def _clarified_question(question: str) -> str:
    """Re-ask the same prompt with a concrete-answer frame."""
    q = " ".join((question or "").strip().split())
    if not q:
        return _FALLBACK_CLARIFICATION_QUESTION
    stripped = q.rstrip("?.!")
    lower = stripped.lower()
    if lower.startswith("tell me about"):
        return f"{stripped} using one specific work or school example."
    if lower.startswith("describe"):
        return (
            f"{stripped} using one specific situation and what you personally did."
        )
    topic = stripped[0].lower() + stripped[1:] if stripped else "the situation"
    return f"Using one specific work or school example, {topic}?"


async def _read_audio_bounded(audio: UploadFile) -> bytes:
    """Read the full upload into memory, aborting with 413 past the cap."""
    buf = bytearray()
    while True:
        chunk = await audio.read(_AUDIO_CHUNK_SIZE)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > _MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"Audio exceeds the {_MAX_AUDIO_BYTES // (1024 * 1024)} MB "
                    "limit. Please record a shorter answer."
                ),
            )
    return bytes(buf)


async def _insert_next_turn(
    db: AsyncSession,
    session_id: UUID,
    *,
    turn_number: int,
    question: str,
    is_followup: bool,
    parent_turn_id: UUID | None = None,
    question_category: QuestionCategory = QuestionCategory.experience_star,
) -> None:
    """Insert the next turn and flush (caller commits).

    Handles both branches of the story-block flow: a follow-up
    (`is_followup=True`, `parent_turn_id` = the block's opening turn) and a
    fresh opening (`is_followup=False`, `parent_turn_id=None`).

    `question_category` is `experience_star` for every turn today; it's a
    parameter (not hard-coded) so the future question-type routing sets it in
    one place when the other three types are generated.
    """
    db.add(InterviewTurn(
        session_id=session_id,
        turn_number=turn_number,
        question_text=question,
        is_followup=is_followup,
        parent_turn_id=parent_turn_id,
        question_category=question_category,
    ))
    await db.flush()


async def _insert_followup_turn(
    db: AsyncSession,
    session_id: UUID,
    parent_turn_id: UUID,
    turn_number: int,
    question: str,
) -> None:
    """Insert the next follow-up turn and flush (caller commits).

    Thin wrapper over `_insert_next_turn` kept for callers/tests that only
    ever produce follow-ups.
    """
    await _insert_next_turn(
        db,
        session_id,
        turn_number=turn_number,
        question=question,
        is_followup=True,
        parent_turn_id=parent_turn_id,
    )


async def _followup_and_tts(
    question: str,
    transcript: str,
    voice_id: str,
    category: FieldCategory | None = None,
    role_signals: list[str] | None = None,
    sample_question_themes: list[str] | None = None,
    experience_level: ExperienceLevel | None = None,
    jd_summary: list[str] | None = None,
    already_asked: list[str] | None = None,
    block_history: list[dict[str, str]] | None = None,
    speech_speed: float | None = None,
    question_category: QuestionCategory = QuestionCategory.experience_star,
) -> tuple[str, str]:
    """Generate follow-up via Flash then TTS — runs before background eval.

    `voice_id` is the per-session voice from `voice_for_session(session.id)`
    — passed in (rather than recomputed here) to keep this helper a pure
    string-in / string-out function the caller can compose freely.

    `category`, `role_signals`, `sample_question_themes`, and
    `experience_level` are passed through to `generate_followup` so the
    follow-up prompt sees the same field / research / seniority context the
    opening question and evaluator already do. `jd_summary` (pasted-JD role
    facts, empty/None otherwise) is threaded the same way so the follow-up
    doesn't mischaracterize how the role operates — e.g. probing group
    collaboration for a solo role.

    `already_asked` (questions already posed this interview) and `block_history`
    (the current story block's prior Q/A pairs) keep a follow-up from repeating
    or re-treading earlier questions — the anti-repetition half of the
    variety fix.
    """
    generated = await generate_followup_transition(
        question,
        transcript,
        category=category,
        role_signals=role_signals,
        sample_question_themes=sample_question_themes,
        experience_level=experience_level,
        jd_summary=jd_summary,
        already_asked=already_asked,
        block_history=block_history,
        question_category=question_category,
    )
    audio_url = await synthesize_speech(
        _tts_text(generated), voice_id=voice_id, speed=speech_speed
    )
    return generated.question, audio_url


async def _opening_and_tts(
    user: User,
    brief: CompanyBrief,
    job_title: str,
    recent_questions: list[str],
    voice_id: str,
    speech_speed: float | None = None,
    question_category: QuestionCategory = QuestionCategory.experience_star,
) -> tuple[str, str]:
    """Generate a fresh opening question mid-session, then TTS.

    Sibling of `_followup_and_tts` — kept separate because the two generators
    take disjoint inputs (an opening needs the candidate profile + research
    brief + avoid-list; a follow-up needs the prior question + transcript).
    Research is reused from the persisted brief, so no Serper call here. Reuses
    the session's persisted voice so a mid-session opening sounds like the same
    interviewer, and the session's persisted `speech_speed` so it plays at the
    pace the candidate chose at create time.

    `question_category` selects the opening's FORM (STAR vs Motivation & Fit),
    threaded from the routing decision; every mid-session opening is
    `experience_star` today.
    """
    next_q = await generate_opening_question(
        user, brief, job_title, recent_questions=recent_questions,
        question_category=question_category,
    )
    audio_url = await synthesize_speech(
        next_q, voice_id=voice_id, speed=speech_speed
    )
    return next_q, audio_url


# ── story-block routing helpers ──────────────────────────────────────────────

def _service_brief_from_out(out: "CompanyBriefOut | None") -> CompanyBrief | None:
    """Rebuild the service `CompanyBrief` from the persisted wire model.

    `generate_opening_question` takes the `company_research.CompanyBrief`
    service type, but mid-session we only hold the `CompanyBriefOut` reparsed
    from `session.company_summary`. The fields are identical except `category`
    is nullable on the wire (legacy rows) and required-with-default on the
    service model, so coalesce it. Returns None when there's no usable brief —
    the caller then falls back to a follow-up rather than an opening.
    """
    if out is None:
        return None
    data = out.model_dump()
    if data.get("category") is None:
        data["category"] = DEFAULT_CATEGORY
    return CompanyBrief.model_validate(data)


def _followup_streak(turns_in_order: list[InterviewTurn]) -> int:
    """Count consecutive follow-ups at the tail of an ordered turn list.

    0 means the last turn is an opening; 1 means one follow-up since the last
    opening; 2 means two (the block's cap).
    """
    streak = 0
    for turn in reversed(turns_in_order):
        if turn.is_followup:
            streak += 1
        else:
            break
    return streak


def _block_opening_id(turns_in_order: list[InterviewTurn]) -> UUID:
    """The id of the opening turn that starts the trailing story block.

    Walks back past the trailing follow-ups to the opening they belong to. The
    parent of any follow-up is always its block's opening (turn 1 is always an
    opening, so this loop always finds one).
    """
    for turn in reversed(turns_in_order):
        if not turn.is_followup:
            return turn.id
    return turns_in_order[-1].id


def _block_route(fu_streak: int, has_brief: bool) -> str:
    """Deterministic part of story-block routing.

    Returns one of 'followup' (drill in), 'opening' (pivot to a new story), or
    'decide' (ask the model whether to probe once more). A missing brief can't
    build an opening, so we always drill in then — which also keeps pre-
    story-block rows byte-identical to the old single-follow-up flow.
    """
    if not has_brief or fu_streak == 0:
        return "followup"
    if fu_streak >= 2:
        return "opening"
    return "decide"


def _current_block_history(
    prior_turns: list[InterviewTurn],
    current_turn: InterviewTurn,
    current_transcript: str,
) -> list[dict[str, str]]:
    """Q&A pairs for the current story block, oldest-first.

    When `current_turn` is a follow-up: the trailing opening in `prior_turns`
    plus every follow-up after it, then the just-answered `current_turn`
    (whose transcript isn't persisted into `prior_turns` yet). When
    `current_turn` is an OPENING it *starts* a new block, so the block is just
    the current pair — walking `prior_turns` here would mislabel the PREVIOUS
    block's Q/As as "this story" and steer the next follow-up back onto the
    prior story's content. Shape matches the evaluator's `history`.
    """
    block: list[InterviewTurn] = []
    if current_turn.is_followup:
        for turn in reversed(prior_turns):
            block.append(turn)
            if not turn.is_followup:
                break
        block.reverse()
    history = [
        {"question": t.question_text, "transcript": t.transcript_text or ""}
        for t in block
    ]
    history.append(
        {"question": current_turn.question_text, "transcript": current_transcript}
    )
    return history


def _session_opening_avoid_list(
    prior_turns: list[InterviewTurn],
    current_turn: InterviewTurn,
    user: User,
) -> list[str]:
    """Avoid-list for a mid-session opening: every question asked this session
    (including the one just answered) plus the user's cross-session recents,
    de-duplicated with order preserved. Fed to
    `generate_opening_question(recent_questions=...)` so a new opening repeats
    neither an intra-session nor a recent cross-session question.
    """
    candidates = (
        [t.question_text for t in prior_turns]
        + [current_turn.question_text]
        + list(user.recent_opening_questions or [])
    )
    seen: list[str] = []
    for q in candidates:
        if q and q not in seen:
            seen.append(q)
    return seen


def _session_asked_questions(
    prior_turns: list[InterviewTurn],
    current_turn: InterviewTurn,
) -> list[str]:
    """Every question asked so far this session (openings AND follow-ups),
    de-duplicated with order preserved. Fed to the follow-up generator's
    avoid-list so a follow-up doesn't echo any earlier question — in
    particular so a 2nd follow-up in a block doesn't re-tread the 1st.

    Within-session only: unlike `_session_opening_avoid_list` it omits the
    user's cross-session recents, since follow-ups are answer-contextual and
    cross-session repetition is already handled for openings.
    """
    seen: list[str] = []
    for q in [t.question_text for t in prior_turns] + [current_turn.question_text]:
        if q and q not in seen:
            seen.append(q)
    return seen


def _roll_session_openings_into_recent(
    session: InterviewSession,
    user: User,
    turns: list[InterviewTurn],
) -> None:
    """Fold this session's mid-session openings into the cross-session avoid-list.

    Turn 1's opening is already rolled at session-create (and gated there for
    custom / saved-question sessions), so only openings from `turn_number > 1`
    are added here. Skipped for re-practice sessions, mirroring the create-time
    `roll_recent` gate. Newest-first, deduped, capped at 3; reassigned only when
    the list actually changes so a plain 2-turn session incurs no write.
    """
    if session.saved_question_id is not None:
        return
    mid_openings = [
        t.question_text
        for t in turns
        if not t.is_followup and t.turn_number > 1 and t.question_text
    ]
    if not mid_openings:
        return
    existing = list(user.recent_opening_questions or [])
    merged: list[str] = []
    for q in [*reversed(mid_openings), *existing]:
        if q and q not in merged:
            merged.append(q)
    merged = merged[:3]
    if merged != existing:
        user.recent_opening_questions = merged


# ── background evaluation ────────────────────────────────────────────────────

def _log_eval_scores(
    session_id: UUID,
    turn_id: UUID,
    category: FieldCategory | None,
    eval_out: EvaluatorOutput,
) -> None:
    """Emit a one-line INFO log with the field category and the 6 rubric
    scores returned by the evaluator. Aimed at smoke-testing field-tailored
    scoring end-to-end — grep the backend log for `Eval scored:` to confirm
    new sessions are running the new rubric."""
    logger.info(
        "Eval scored: session=%s turn=%s category=%r "
        "d1=%s d2=%s d3=%s d4=%s d5=%s delivery=%s",
        session_id, turn_id, category,
        eval_out.dimension_1, eval_out.dimension_2, eval_out.dimension_3,
        eval_out.dimension_4, eval_out.dimension_5, eval_out.delivery,
    )


def _apply_eval_to_turn(turn: InterviewTurn, eval_out: EvaluatorOutput) -> None:
    """Copy evaluator output onto an InterviewTurn row (no commit)."""
    turn.dimension_1_score     = eval_out.dimension_1
    turn.dimension_2_score     = eval_out.dimension_2
    turn.dimension_3_score     = eval_out.dimension_3
    turn.dimension_4_score     = eval_out.dimension_4
    turn.dimension_5_score     = eval_out.dimension_5
    turn.delivery_score        = eval_out.delivery
    turn.feedback              = eval_out.notes
    turn.feedback_detail       = eval_out.feedback_detail.model_dump()
    turn.ai_model_used         = EVAL_MODEL
    turn.evaluated_at          = datetime.utcnow()


async def _attach_next_take(
    eval_out: EvaluatorOutput,
    question: str,
    transcript: str,
    category: FieldCategory | None,
    experience_level: ExperienceLevel | None,
) -> None:
    """Run the focused coaching call and merge `next_take` into `eval_out`.

    Best-effort and grounded in the evaluator output that just landed. The
    coaching service already fails soft (returns None on any error), but we
    still guard here so a coaching problem can never block scoring/finalization.
    Mutates `eval_out.feedback_detail` in place so the downstream
    `_apply_eval_to_turn` persists it with the rest of the feedback.
    """
    try:
        next_take = await generate_next_take(
            question, transcript, eval_out,
            category=category, experience_level=experience_level,
        )
        if next_take is not None:
            eval_out.feedback_detail.next_take = next_take
    except Exception:  # noqa: BLE001
        logger.exception("next_take generation failed; leaving it unset")


async def _run_background_eval(
    session_id: UUID,
    turn_id: UUID,
    question: str,
    transcript: str,
    history: list[dict],
    cv_summary: dict | None,
    category: FieldCategory | None,
    experience_level: ExperienceLevel | None = None,
    jd_summary: list[str] | None = None,
    question_category: QuestionCategory = QuestionCategory.experience_star,
    resume_excerpt: str | None = None,
) -> None:
    """Evaluate a turn after the request has already returned, then persist.

    Runs in its own AsyncSession because the request-scoped session that
    spawned this task is closed by the time the response leaves the wire.
    Failures are swallowed (logged) per the "skip_and_log" policy: turn 1
    just keeps its null scores and the finalize aggregator drops it from
    the per-dim average. Always unregisters from the eval registry in the
    `finally` block so a missed finalize doesn't leak the Task reference.

    `category` is the persisted `brief.category` for the session and selects
    the field-tailored rubric appendix inside `evaluate_turn`. `experience_level`
    is the candidate's seniority and selects the experience-tailored rubric
    appendix; both are passed explicitly because this task runs in a detached
    AsyncSession with no access to the request-scoped `user` row. `jd_summary`
    (pasted-JD role facts, `None`/empty otherwise) rides through the same way as
    calibration-only context for the evaluator. `resume_excerpt` (the candidate's
    résumé) is passed from the request path — where the `user` row is live — and
    grounds the Evidence dimension for Self-Assessment & Growth only (the evaluator
    ignores it for other types).
    """
    try:
        async with AsyncSessionLocal() as db:
            try:
                eval_out = await evaluate_turn(
                    question, transcript, history,
                    cv_summary=cv_summary, category=category,
                    experience_level=experience_level,
                    jd_summary=jd_summary,
                    question_category=question_category,
                    resume_excerpt=resume_excerpt,
                )
                _log_eval_scores(session_id, turn_id, category, eval_out)
                await _attach_next_take(
                    eval_out, question, transcript, category, experience_level,
                )
                turn = await db.get(InterviewTurn, turn_id)
                if turn is None:
                    logger.warning(
                        "Background eval: turn %s vanished before scores landed; "
                        "skipping write.",
                        turn_id,
                    )
                    return
                _apply_eval_to_turn(turn, eval_out)
                await db.commit()
                logger.info(
                    "Background eval complete for session=%s turn=%s",
                    session_id, turn_id,
                )
            except Exception:
                # Roll the half-applied transaction back, then re-raise so the
                # outer except logs the traceback. Without rollback the next
                # use of this session inside the same `async with` would
                # surface a confusing "current transaction is aborted" error.
                await db.rollback()
                raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Background eval failed for session=%s turn=%s; "
            "scores remain null and the turn will be excluded from the "
            "session aggregate.",
            session_id, turn_id,
        )
        await log_error(
            exc,
            metadata={
                "source": "background_eval",
                "session_id": session_id,
                "turn_id": turn_id,
            },
        )
    finally:
        eval_registry.discard(session_id, turn_id)


async def _await_background_evals(session_id: UUID) -> None:
    """If known turn evals are still running, wait before finalizing.

    Idempotent: returns immediately when no task is registered (e.g. the
    background task already finished and called `discard`, or the demo
    happens to be running on a worker that restarted between turns and
    lost the in-memory registry — the inline fallback in `submit_turn`
    handles the latter case).
    """
    tasks = eval_registry.pop_session(session_id)
    pending = [task for task in tasks if not task.done()]
    if not pending:
        return
    logger.info(
        "Finalize: waiting for %s background eval(s) to finish for session=%s",
        len(pending), session_id,
    )
    # The tasks themselves swallow exceptions, so this gather never raises.
    await asyncio.gather(*pending)


# ── session-completion aggregation ────────────────────────────────────────────

# Per-turn score tuple shape used by the aggregator below:
# (structure, problem_solving, impact, initiative, depth, delivery, fillers)
# All score slots are nullable so that a turn whose background eval
# failed (or was never run) cleanly drops out of the per-dim averages.
_TurnScores = tuple[
    float | None, float | None, float | None,
    float | None, float | None, float | None,
    int,
]


def _per_dimension_averages(turns: list[_TurnScores]) -> dict[str, float | None]:
    """Average each rubric dimension independently across `turns`.

    Each dimension is filtered for non-null values BEFORE averaging so:
      * `delivery` is averaged only over turns where the candidate had the
        camera on (legacy behavior — webcam declined ⇒ null).
      * Any of the 5 base scores can also be null when a turn's background
        eval crashed or never ran. Such a turn contributes null for the
        affected dim but still counts for the others (it shouldn't
        normally — eval is all-or-nothing — but this keeps the aggregator
        robust to partial failure).

    Returns null for a dimension when no turn produced a score for it; the
    history chart drops the line entirely instead of plotting zeros.
    """
    def _avg(values: list[float | None]) -> float | None:
        non_null = [v for v in values if v is not None]
        return round(sum(non_null) / len(non_null), 2) if non_null else None

    return {
        "dimension_1": _avg([t[0] for t in turns]),
        "dimension_2": _avg([t[1] for t in turns]),
        "dimension_3": _avg([t[2] for t in turns]),
        "dimension_4": _avg([t[3] for t in turns]),
        "dimension_5": _avg([t[4] for t in turns]),
        "delivery":    _avg([t[5] for t in turns]),
    }


async def _upsert_session_metrics(
    db: AsyncSession,
    *,
    session_id: UUID,
    averages: dict[str, float | None],
    total_filler_word_count: int,
    total_word_count: int,
    total_duration_seconds: float | None,
    overall_score: float | None,
    turns_evaluated: int,
) -> None:
    """Write (or replace) the cached aggregate row for a completed session.

    `session_metrics.session_id` has a UNIQUE constraint, so a re-finalize
    of the same session (shouldn't happen in the normal flow but cheap
    insurance) deletes the existing row first rather than tripping IntegrityError.
    """
    existing = await db.execute(
        select(SessionMetrics).where(SessionMetrics.session_id == session_id)
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.flush()

    db.add(SessionMetrics(
        session_id=session_id,
        avg_dimension_1=averages["dimension_1"],
        avg_dimension_2=averages["dimension_2"],
        avg_dimension_3=averages["dimension_3"],
        avg_dimension_4=averages["dimension_4"],
        avg_dimension_5=averages["dimension_5"],
        avg_delivery=averages["delivery"],
        total_filler_word_count=total_filler_word_count,
        total_word_count=total_word_count,
        total_duration_seconds=total_duration_seconds,
        overall_score=overall_score,
        turns_evaluated=turns_evaluated,
    ))
    await db.flush()


async def _complete_session_from_turns(
    db: AsyncSession,
    *,
    session: InterviewSession,
    turns: list[InterviewTurn],
) -> bool:
    """Aggregate evaluated turns and mark the session completed.

    Turns whose evaluator failed keep nullable score columns and are excluded
    from the relevant averages, matching the existing finalization policy.

    Returns True if this call is the one that completed the session, False if
    another worker had already finalized it (see the conditional-UPDATE gate
    below) — the caller uses this to decide between commit and rollback.
    """
    all_turn_scores: list[_TurnScores] = [
        (
            float(t.dimension_1_score) if t.dimension_1_score is not None else None,
            float(t.dimension_2_score) if t.dimension_2_score is not None else None,
            float(t.dimension_3_score) if t.dimension_3_score is not None else None,
            float(t.dimension_4_score) if t.dimension_4_score is not None else None,
            float(t.dimension_5_score) if t.dimension_5_score is not None else None,
            float(t.delivery_score)    if t.delivery_score    is not None else None,
            int(t.filler_word_count or 0),
        )
        for t in turns
        if t.transcript_text is not None
    ]
    per_dim_avgs = _per_dimension_averages(all_turn_scores)
    total_fillers = sum(t[6] for t in all_turn_scores)
    total_words = sum(int(t.word_count or 0) for t in turns)
    # Speech-span total for the session-level speaking pace (word-weighted:
    # Σwords ÷ Σminutes, matching the lifetime filler rate in `me.py` — NOT a
    # mean of per-turn WPMs). None when no turn carries a measurement, which is
    # the case for every session finalized before migration 0030.
    turn_durations = [
        float(t.duration_seconds)
        for t in turns
        if t.transcript_text is not None and t.duration_seconds is not None
    ]
    total_duration = sum(turn_durations) if turn_durations else None
    flat_scores = [
        v for t in all_turn_scores for v in t[:6] if v is not None
    ]
    overall: float | None
    if flat_scores:
        overall = min(99.99, round(sum(flat_scores) / len(flat_scores) * 10, 2))
    else:
        overall = None

    turns_evaluated = sum(
        1 for t in all_turn_scores if any(v is not None for v in t[:6])
    )

    # Idempotent completion gate — cross-process safe.
    #
    # During a blue/green deploy cutover two finalizers can run for the same
    # session: the outgoing color's still-detached background task plus the
    # incoming color's lazy reaper. Both can read status=in_progress before
    # either commits, and the `_finalizing_sessions` dedup set is per-process so
    # it can't see across them. Flip the status with a conditional UPDATE
    # instead: under READ COMMITTED the second writer blocks on this row's lock,
    # then re-checks the predicate after the first commits, matches zero rows,
    # and bails — so the metrics write happens exactly once no matter how many
    # finalizers race. (Usage counters no longer ride this path at all; they're
    # charged per answered turn in `submit_turn`.)
    result = await db.execute(
        update(InterviewSession)
        .where(
            InterviewSession.id == session.id,
            InterviewSession.status == SessionStatus.in_progress,
        )
        .values(
            status=SessionStatus.completed,
            ended_at=func.now(),
            overall_score=overall,
        )
    )
    if result.rowcount == 0:
        logger.info(
            "Session %s already finalized by another worker; skipping metrics "
            "upsert.",
            session.id,
        )
        return False

    # Mirror the committed row onto the in-memory ORM object for consistency.
    session.status        = SessionStatus.completed
    session.overall_score = overall

    await _upsert_session_metrics(
        db,
        session_id=session.id,
        averages=per_dim_avgs,
        total_filler_word_count=total_fillers,
        total_word_count=total_words,
        total_duration_seconds=total_duration,
        overall_score=overall,
        turns_evaluated=turns_evaluated,
    )

    return True


async def _run_background_finalize(
    session_id: UUID,
    final_turn_id: UUID,
    category: FieldCategory | None,
    experience_level: ExperienceLevel | None = None,
    jd_summary: list[str] | None = None,
) -> None:
    """Evaluate the final turn and complete the session after the request returns."""
    try:
        async with AsyncSessionLocal() as db:
            session = await db.get(InterviewSession, session_id)
            if session is None:
                logger.warning(
                    "Background finalize: session %s vanished before completion",
                    session_id,
                )
                return
            if session.status == SessionStatus.completed:
                return
            if session.status != SessionStatus.in_progress:
                logger.warning(
                    "Background finalize: session=%s status=%s; skipping",
                    session_id,
                    session.status,
                )
                return

            user = await db.get(User, session.user_id)
            if user is None:
                logger.warning(
                    "Background finalize: user %s vanished for session=%s",
                    session.user_id,
                    session_id,
                )
                return

            # Let detached evals finish if this worker still knows about them.
            # Missing/stale registry entries are handled by the inline fallback
            # below.
            await _await_background_evals(session_id)

            turns_result = await db.execute(
                select(InterviewTurn)
                .where(InterviewTurn.session_id == session_id)
                .order_by(InterviewTurn.turn_number)
            )
            turns = list(turns_result.scalars().all())

            for turn in turns:
                if turn.transcript_text is None or turn.dimension_1_score is not None:
                    continue

                if turn.id != final_turn_id:
                    logger.warning(
                        "Background finalize inline-eval fallback for "
                        "session=%s turn=%s",
                        session_id,
                        turn.id,
                    )

                history = [
                    {"question": t.question_text, "transcript": t.transcript_text}
                    for t in turns
                    if (
                        t.id != turn.id
                        and t.transcript_text is not None
                        and t.turn_number < turn.turn_number
                    )
                ]
                inline_cv = turn.cv_summary if isinstance(turn.cv_summary, dict) else None
                try:
                    eval_out = await evaluate_turn(
                        turn.question_text,
                        turn.transcript_text,
                        history,
                        cv_summary=inline_cv,
                        category=category,
                        experience_level=experience_level,
                        jd_summary=jd_summary,
                        question_category=turn.question_category,
                        # Résumé grounds the Evidence dimension for Self-Assessment
                        # & Growth only. This task already loaded the `user` row
                        # above, so read it directly (no threading needed); other
                        # types get None and the evaluator ignores it.
                        resume_excerpt=(
                            user.resume_text
                            if turn.question_category
                            == QuestionCategory.self_assessment_growth
                            else None
                        ),
                    )
                    _log_eval_scores(session_id, turn.id, category, eval_out)
                    await _attach_next_take(
                        eval_out,
                        turn.question_text,
                        turn.transcript_text,
                        category,
                        experience_level,
                    )
                    _apply_eval_to_turn(turn, eval_out)
                except Exception as exc:  # noqa: BLE001
                    logger.exception(
                        "Background finalize eval failed for session=%s turn=%s; "
                        "this turn will be excluded from the session aggregate.",
                        session_id,
                        turn.id,
                    )
                    await log_error(
                        exc,
                        user=user,
                        db=db,
                        metadata={
                            "source": "background_finalize",
                            "session_id": session_id,
                            "turn_id": turn.id,
                        },
                    )

            completed = await _complete_session_from_turns(
                db,
                session=session,
                turns=turns,
            )
            if completed:
                # Fold this session's mid-session openings into the user's
                # cross-session avoid-list so a later session won't repeat them.
                # Rides the same commit as the completed metrics.
                _roll_session_openings_into_recent(session, user, turns)
                await db.commit()
                logger.info("Background finalize complete for session=%s", session_id)
            else:
                # Lost the finalize race to another worker (deploy-cutover
                # overlap). Discard our redundant re-evaluation instead of
                # committing it over the turn rows the winner already wrote.
                await db.rollback()
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Background finalize failed for session=%s; session remains in_progress.",
            session_id,
        )
        await log_error(
            exc,
            metadata={
                "source": "background_finalize",
                "session_id": session_id,
            },
        )


@router.post("/{session_id}/turns", response_model=TurnSubmitOut)
async def submit_turn(
    session_id: UUID,
    audio: UploadFile = File(...),
    # Browser-computed webcam analytics (see `faceHeuristics.ts` on the
    # frontend). JSON-encoded; missing when the candidate declined camera.
    # Parse failures degrade gracefully to the 5-score path rather than 400.
    cv_summary: str | None = Form(None),
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> TurnSubmitOut:
    # 1. Load session — verify ownership.
    session = await db.get(InterviewSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    if cv_summary and not has_active_delivery_analytics_consent(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Delivery analytics consent is required before camera-derived "
                "delivery summaries can be submitted."
            ),
        )

    # 1a. Pull the persisted brief's category so we can hand it to the
    # evaluator and get field-tailored scoring. Legacy sessions persisted
    # before categorization existed produce `category=None`, which the
    # evaluator handles by falling back to the default-category prompt.
    brief_out = _parse_company_summary(session.company_summary)
    category: FieldCategory | None = brief_out.category if brief_out else None
    # Role facts distilled from a pasted JD (empty for Serper / no-JD sessions).
    # Threaded into the follow-up and evaluator as calibration-only context so
    # they don't mischaracterize how the role operates (e.g. probing group
    # collaboration for a solo role).
    jd_summary: list[str] | None = brief_out.jd_summary if brief_out else None
    # The candidate's seniority tailors the evaluator rubric alongside the
    # field category. Read from the SESSION (frozen at create time), NOT the
    # live user row: this keeps turn 1 and turn 2 on the same rubric even if
    # the user edits their profile mid-session, and keeps re-practices of a
    # saved question apples-to-apples after a profile change. None for legacy
    # rows created before this column existed; the evaluator omits the
    # experience appendix in that case.
    experience_level = session.experience_level

    # 2. Find the current unanswered turn (question exists, transcript is NULL)
    #    and LOCK it. `with_for_update(skip_locked=True)` is what closes the
    #    double-submit race: two concurrent POSTs for the same answer (double
    #    click, retry, two tabs) used to both read this row before either wrote
    #    a transcript — many `await`s pass before the commit in step 6 — so both
    #    sailed through to a billed evaluator call. Now the first request holds a
    #    row lock for the rest of the transaction; the second's `skip_locked`
    #    SELECT skips the locked row and gets nothing back.
    result = await db.execute(
        select(InterviewTurn)
        .where(
            InterviewTurn.session_id == session_id,
            InterviewTurn.transcript_text.is_(None),
        )
        .order_by(InterviewTurn.turn_number)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    current_turn = result.scalar_one_or_none()
    if current_turn is None:
        # No row available — but distinguish "genuinely no pending turn" (all
        # turns answered) from "the pending turn is locked by a sibling request
        # that's mid-flight". A plain (non-locking) re-check tells them apart so
        # we return the right status: a concurrent submit gets 409 (the client
        # should not retry), an already-complete session keeps the old 400.
        pending_exists = await db.scalar(
            select(InterviewTurn.id)
            .where(
                InterviewTurn.session_id == session_id,
                InterviewTurn.transcript_text.is_(None),
            )
            .limit(1)
        )
        if pending_exists is not None:
            raise HTTPException(
                status_code=409,
                detail="This answer is already being processed.",
            )
        raise HTTPException(status_code=400, detail="No pending turn for this session")

    # 3. Transcribe. Bounded read so an oversized upload is rejected with 413
    #    before it can OOM the worker or be sent to ElevenLabs STT.
    audio_bytes = await _read_audio_bounded(audio)
    transcription = await transcribe_audio(audio_bytes, audio.filename or "audio.webm")
    transcript = transcription.text

    # 3a-pre. Deterministic prompt-injection gate. Free (no network) so it runs
    # BEFORE the billed moderation call: a transcript carrying an injection
    # marker never reaches moderation, the evaluator, or the DB. The pending turn
    # is left untouched (transcript still NULL) so the candidate simply
    # re-records — same UX as the moderation reject below. "violates our usage
    # policy" wording is load-bearing: the frontend maps it to the re-record
    # message in `Practice.tsx`.
    if contains_injection(transcript):
        logger.info(
            "Turn rejected by injection gate for session=%s turn=%s",
            session_id, current_turn.id,
        )
        await log_injection_detected(
            source="sessions.transcript",
            text=transcript,
            user=user,
            session_id=session_id,
            db=db,
            metadata={"turn_id": current_turn.id},
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Your answer contains content that violates our usage policy. "
                "Please re-record and try again."
            ),
        )

    # 3a. Moderation pre-check on the transcript. Running BEFORE we persist
    # the row or spawn any LLM call means flagged content never reaches
    # OpenRouter / downstream providers and never lands in `interview_turns`.
    # The user gets a clean 422 instead of a scored turn; they can retry
    # with different content on the same still-pending turn.
    transcript_check = await check_moderation(
        transcript,
        user=user,
        db=db,
        session_id=session_id,
        metadata={
            "source": "turn.transcript",
            "session_id": session_id,
            "turn_id": current_turn.id,
        },
    )
    if transcript_check.flagged:
        logger.info(
            "Turn rejected by moderation for session=%s turn=%s categories=%s",
            session_id, current_turn.id, transcript_check.categories,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Your answer contains content that violates our usage "
                "policy. Please re-record and try again."
            ),
        )

    if (
        not session.clarification_retry_used
        and _is_clarification_request(transcript)
    ):
        clarified = _clarified_question(current_turn.question_text)
        turn_voice_id = session.voice_id or voice_for_session(session.id)
        turn_speech_speed = (
            float(session.speech_speed)
            if session.speech_speed is not None
            else None
        )
        audio_url = await synthesize_speech(
            clarified, voice_id=turn_voice_id, speed=turn_speech_speed
        )
        current_turn.question_text = clarified
        session.clarification_retry_used = True
        await db.commit()
        filler_count, filler_breakdown = count_filler_words(transcript)
        return TurnSubmitOut(
            transcript=transcript,
            scores=None,
            feedback=None,
            feedback_detail=None,
            filler_word_count=filler_count,
            filler_word_breakdown=filler_breakdown,
            next_question=clarified,
            next_question_audio_url=audio_url,
            next_question_is_followup=current_turn.is_followup,
            clarification_retry=True,
            is_final=False,
            evaluation_pending=False,
        )

    # 4. Filler words (regex ground truth per CLAUDE.md) + total spoken word
    #    count (the denominator for BOTH the filler rate and words-per-minute;
    #    both counters scrub ElevenLabs audio-event tags first). The pace
    #    denominator is the STT speech span, which is None on any unexpected
    #    response shape — `speaking_pace_wpm` then yields None (no pace shown).
    filler_count, filler_breakdown = count_filler_words(transcript)
    word_count = count_words(transcript)
    turn_pace_wpm = speaking_pace_wpm(word_count, transcription.duration_seconds)

    # 5. Collect prior evaluated turns for history context.
    prior_result = await db.execute(
        select(InterviewTurn)
        .where(
            InterviewTurn.session_id == session_id,
            InterviewTurn.transcript_text.isnot(None),
        )
        .order_by(InterviewTurn.turn_number)
    )
    prior_turns = prior_result.scalars().all()
    history = [
        {"question": t.question_text, "transcript": t.transcript_text}
        for t in prior_turns
    ]

    # 6. Parse webcam analytics sidecar if present. Failing closed (None)
    # keeps the turn viable; the evaluator just skips the delivery score.
    parsed_cv_summary: dict | None = None
    if cv_summary:
        try:
            loaded = json.loads(cv_summary)
            if isinstance(loaded, dict):
                parsed_cv_summary = loaded
            else:
                logger.warning("cv_summary payload was not a JSON object; ignoring")
        except json.JSONDecodeError as exc:
            logger.warning("cv_summary JSON parse failed: %s", exc)

    # 7. Session-specific turn rule: the persisted target count determines the
    # final turn. Legacy rows created before the column existed read the DB
    # default of 2.
    is_final = current_turn.turn_number >= session.num_turns

    # 8a. Persist transcript + filler counts BEFORE doing evaluator work.
    #     Background tasks mutate this same row; persisting now means they
    #     always find a transcript to evaluate against and the row is durable
    #     even if a task crashes.
    #     `transcript` keeps its audio-event tags verbatim — the evaluator
    #     should see "(laughter)" and the candidate should read what they
    #     actually said; only the counts above are computed on scrubbed text.
    current_turn.transcript_text       = transcript
    current_turn.cv_summary            = parsed_cv_summary
    current_turn.filler_word_count     = filler_count
    current_turn.filler_word_breakdown = filler_breakdown
    current_turn.word_count            = word_count
    current_turn.duration_seconds      = transcription.duration_seconds

    # 8a-bis. Free-tier metering. Both counters ride whichever commit closes this
    # handler (the non-final branch's, or the final branch's below), so a failure
    # in next-question generation / TTS rolls the charge back together with the
    # turn — the candidate is never billed for an answer that wasn't persisted.
    #
    # A TURN is charged when answered, not when the session finalizes. Every
    # submitted turn fires evaluator + coaching + next-question + TTS, and a
    # session abandoned by closing the tab never finalizes at all (the lazy
    # reaper deliberately won't touch a session with an unanswered turn), so
    # finalization-time counting under-charges exactly the expensive case.
    #
    # Turn 1 additionally claims the weekly SESSION slot. Claiming it at create
    # would burn one of only 10 weekly slots on a mic failure; claiming it at
    # finalization would let the same tab-close abandon evade the weekly cap.
    # This sits after the clarification-retry early return above, so a re-ask
    # stays free — it neither scores nor advances the turn.
    if user.tier == UserTier.free:
        await increment_turns(db, user)
        if current_turn.turn_number == 1:
            await increment_week(db, user)

    # 8b. Branch: non-final returns the next question; final returns immediately
    #     after spawning session finalization below.
    if not is_final:
        # Only wait for next-question generation + TTS. Evaluation is spawned as
        # a detached task that writes scores to the DB later.
        # Voice was resolved at session-create time and persisted on
        # `session.voice_id`, so every follow-up / mid-session opening sounds
        # like the same interviewer even after a refresh. Legacy rows (created
        # before the column existed) fall back to the old deterministic-random
        # derivation from session.id — which would have given the same answer at
        # session-create time, so the behavior is unchanged for those rows too.
        turn_voice_id = session.voice_id or voice_for_session(session.id)
        # Frozen at create time (None on legacy rows → tts default), so every
        # mid-session question (follow-up OR fresh opening) plays at the pace the
        # candidate chose for turn 1.
        turn_speech_speed = (
            float(session.speech_speed)
            if session.speech_speed is not None
            else None
        )
        next_turn_number = current_turn.turn_number + 1

        # Story-block routing (CLAUDE.md "Story-block interviews"): decide whether
        # the next turn drills into the CURRENT story (a follow-up) or pivots to a
        # fresh opening. A block is 1 opening + 1-2 follow-ups:
        #   streak 0 (just answered an opening) -> follow-up #1 (always)
        #   streak 1 (just answered follow-up #1) -> model decides: probe or pivot
        #   streak 2 (just answered follow-up #2) -> forced pivot to a new opening
        # A legacy/missing brief can't build an opening, so routing collapses to
        # a single follow-up — byte-identical to the pre-story-block flow.
        ordered_turns = [*prior_turns, current_turn]
        service_brief = _service_brief_from_out(brief_out)
        fu_streak = _followup_streak(ordered_turns)
        route = _block_route(fu_streak, has_brief=service_brief is not None)
        if route == "decide":
            route = (
                "followup"
                if await should_continue_followup(
                    _current_block_history(prior_turns, current_turn, transcript),
                    experience_level=experience_level,
                    question_category=current_turn.question_category,
                )
                else "opening"
            )

        # The next question's FORM. By default it inherits the just-answered
        # turn's category — a single-category session and every follow-up (a story
        # block stays one type). In "Recommended Mix" mode a NEW story-block
        # opening instead draws a fresh calibrated category, without repeating one
        # already used by this session's openings.
        next_question_category = current_turn.question_category
        if route == "opening" and session.calibrated_mix:
            next_question_category = draw_opening_category(
                field=category,
                level=experience_level,
                num_turns=session.num_turns,
                used={t.question_category for t in ordered_turns if not t.is_followup},
                is_first_opening=False,
            )

        if route == "opening":
            next_q, next_audio_url = await _opening_and_tts(
                user,
                service_brief,
                session.job_title,
                _session_opening_avoid_list(prior_turns, current_turn, user),
                turn_voice_id,
                speech_speed=turn_speech_speed,
                question_category=next_question_category,
            )
            await _insert_next_turn(
                db,
                session_id,
                turn_number=next_turn_number,
                question=next_q,
                is_followup=False,
                parent_turn_id=None,
                question_category=next_question_category,
            )
        else:
            # Anti-repetition context: the block's prior Q/As (everything before
            # the turn we're following up on) plus the within-session avoid-list,
            # so a 2nd follow-up probes a new facet instead of echoing the 1st.
            next_q, next_audio_url = await _followup_and_tts(
                current_turn.question_text,
                transcript,
                turn_voice_id,
                category=category,
                role_signals=brief_out.role_signals if brief_out else None,
                sample_question_themes=(
                    brief_out.sample_question_themes if brief_out else None
                ),
                experience_level=experience_level,
                jd_summary=jd_summary,
                already_asked=_session_asked_questions(prior_turns, current_turn),
                block_history=_current_block_history(
                    prior_turns, current_turn, transcript
                )[:-1],
                speech_speed=turn_speech_speed,
                question_category=next_question_category,
            )
            await _insert_next_turn(
                db,
                session_id,
                turn_number=next_turn_number,
                question=next_q,
                is_followup=True,
                parent_turn_id=_block_opening_id(ordered_turns),
                question_category=next_question_category,
            )
        # Commit BEFORE registering the background task so the bg task's
        # fresh AsyncSession sees the persisted transcript on its first
        # query. Without this, there's a tiny race where the task could
        # start evaluating an empty transcript_text.
        await db.commit()

        bg_task = asyncio.create_task(
            _run_background_eval(
                session_id=session_id,
                turn_id=current_turn.id,
                question=current_turn.question_text,
                transcript=transcript,
                history=history,
                cv_summary=parsed_cv_summary,
                category=category,
                experience_level=experience_level,
                jd_summary=jd_summary,
                question_category=current_turn.question_category,
                # Résumé grounds the Evidence dimension for Self-Assessment &
                # Growth only; pass the live user's résumé for that type, else None
                # (the evaluator re-gates by category, so this is belt-and-braces).
                resume_excerpt=(
                    user.resume_text
                    if current_turn.question_category
                    == QuestionCategory.self_assessment_growth
                    else None
                ),
            ),
            name=f"eval-session-{session_id}-turn-{current_turn.turn_number}",
        )
        eval_registry.register(session_id, current_turn.id, bg_task)

        return TurnSubmitOut(
            transcript=transcript,
            scores=None,
            feedback=None,
            feedback_detail=None,
            filler_word_count=filler_count,
            filler_word_breakdown=filler_breakdown,
            speaking_pace_wpm=turn_pace_wpm,
            next_question=next_q,
            next_question_audio_url=next_audio_url,
            next_question_is_followup=(route == "followup"),
            next_question_category=next_question_category.value,
            is_final=False,
            evaluation_pending=True,
        )

    # 8c. Final turn: persist immediately, then complete scoring/aggregation
    #     in the background so the user can enter Results without waiting on
    #     the evaluator. The session remains `in_progress` until the task
    #     writes metrics and flips it to `completed`. `updated_at` is stamped
    #     here as the "final answer committed" clock the lazy reaper in
    #     `get_session` measures its grace period against (the column has no
    #     onupdate, so nothing else moves it between create and now).
    session.updated_at = datetime.utcnow()
    await db.commit()

    _spawn_finalize(
        session_id=session_id,
        final_turn_id=current_turn.id,
        category=category,
        experience_level=experience_level,
        jd_summary=jd_summary,
    )

    return TurnSubmitOut(
        transcript=transcript,
        scores=None,
        feedback=None,
        feedback_detail=None,
        filler_word_count=filler_count,
        filler_word_breakdown=filler_breakdown,
        speaking_pace_wpm=turn_pace_wpm,
        next_question=None,
        next_question_audio_url=None,
        is_final=True,
        evaluation_pending=True,
    )


@router.post("/{session_id}/end", response_model=SessionEndOut)
async def end_session_early(
    session_id: UUID,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionEndOut:
    """Finalize a session the user is quitting mid-interview, grading only the
    turns they actually completed.

    A longer (2–8 turn) interview can be interrupted — class starts, time runs
    out — so abandoning the whole thing and losing the feedback for turns the
    candidate DID finish is unfair. Every completed turn was already submitted
    and evaluated in the background, so we can grade the session on just those.

    Requires ≥ 1 answered (transcript-bearing) turn; the frontend only calls
    this in that case (a zero-turn quit stays a pure client-side abandon with
    no record and no usage charge, since nothing is charged until turn 1 is
    submitted). This endpoint moves no counters itself: the turns the candidate
    answered were already charged as they were submitted, and turn 1 already
    claimed the weekly session slot. Quitting early therefore costs exactly what
    was used — the unanswered remainder of the session is refunded by never
    having been charged.

    Mirrors the final-turn finalize: trims the dangling unanswered turn, then
    spawns the same detached `_run_background_finalize`. Returning immediately
    (rather than awaiting) lets the finalize survive the user closing the tab
    the instant they quit; the generalized lazy reaper in `get_session` is the
    backstop if that detached task dies.
    """
    session = await db.get(InterviewSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    turns_result = await db.execute(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.turn_number)
    )
    turns = list(turns_result.scalars().all())

    answered = [t for t in turns if t.transcript_text is not None]
    if not answered:
        raise HTTPException(
            status_code=422,
            detail="No completed turns to grade.",
        )

    # Trim the dangling turn(s): when a non-final turn is submitted the next
    # question is inserted + committed with a NULL transcript, so a quit mid-
    # interview leaves exactly one unanswered turn. Deleting it leaves the
    # session with only completed turns, so (a) SessionDetail/history render no
    # empty trailing turn and (b) the reaper's "no pending turn" signal is
    # well-defined. Each is a leaf (nothing points to it as parent_turn_id).
    for turn in turns:
        if turn.transcript_text is None:
            await db.delete(turn)

    final_turn = max(answered, key=lambda t: t.turn_number)

    # Fresh reaper clock (mirrors the final-turn path), then commit before
    # spawning so the detached finalizer reads the trimmed, committed state.
    session.updated_at = datetime.utcnow()
    await db.commit()

    brief = _parse_company_summary(session.company_summary)
    _spawn_finalize(
        session_id=session_id,
        final_turn_id=final_turn.id,
        category=brief.category if brief else None,
        experience_level=session.experience_level,
        jd_summary=brief.jd_summary if brief else None,
    )

    return SessionEndOut(
        session_id=session_id,
        status=session.status.value,
        graded_turns=len(answered),
    )


# ── history routes ───────────────────────────────────────────────────────────

# Hard cap on `GET /sessions` rows. The history page renders a chart + table
# inline, so paging UI is overkill for the demo — 50 most-recent completed
# sessions is well past anything a user will rack up during the hackathon.
_HISTORY_LIMIT = 50


def _averages_from_metrics(m: SessionMetrics | None) -> DimensionAverages:
    """Adapt the cached metrics row to the wire-format averages object."""
    if m is None:
        return DimensionAverages()
    return DimensionAverages(
        dimension_1=m.avg_dimension_1,
        dimension_2=m.avg_dimension_2,
        dimension_3=m.avg_dimension_3,
        dimension_4=m.avg_dimension_4,
        dimension_5=m.avg_dimension_5,
        delivery=m.avg_delivery,
    )


def _parse_company_summary(raw: str | None) -> CompanyBriefOut | None:
    """Decode the persisted JSON brief back into the wire-format model.

    Returns None on missing or malformed payloads so a single bad row in
    history doesn't 500 the whole detail screen.
    """
    if not raw:
        return None
    try:
        return CompanyBriefOut.model_validate_json(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("company_summary parse failed: %s", exc)
        return None


@router.get("", response_model=list[SessionListItem])
async def list_sessions(
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> list[SessionListItem]:
    """Return the caller's completed sessions, newest first.

    Per-dimension averages are read from the cached `session_metrics` row
    populated when the session finalized. Sessions that finished BEFORE
    that cache existed (legacy rows) come back with all averages = null;
    the frontend chart simply skips them.
    """
    # Per-session question-category rollup: how many DISTINCT categories the
    # session's turns span, plus the (arbitrary) min category. One distinct
    # category → that category; more than one → a "Recommended Mix" session.
    # Lets the History page filter the trend chart + list by category.
    cat_subq = (
        select(
            InterviewTurn.session_id.label("sid"),
            func.count(func.distinct(InterviewTurn.question_category)).label(
                "cat_count"
            ),
            func.min(InterviewTurn.question_category).label("cat_min"),
        )
        .group_by(InterviewTurn.session_id)
        .subquery()
    )
    result = await db.execute(
        select(
            InterviewSession,
            SessionMetrics,
            cat_subq.c.cat_count,
            cat_subq.c.cat_min,
        )
        .outerjoin(
            SessionMetrics,
            SessionMetrics.session_id == InterviewSession.id,
        )
        .outerjoin(cat_subq, cat_subq.c.sid == InterviewSession.id)
        .where(
            InterviewSession.user_id == user.id,
            InterviewSession.status == SessionStatus.completed,
        )
        .order_by(InterviewSession.created_at.desc())
        .limit(_HISTORY_LIMIT)
    )
    rows: list[SessionListItem] = []
    for session, metrics, cat_count, cat_min in result.all():
        # None when the session has no turns; "mixed" when its turns span more
        # than one category; else the single category value.
        if not cat_count:
            session_category = None
        elif cat_count > 1:
            session_category = "mixed"
        else:
            session_category = (
                cat_min.value if hasattr(cat_min, "value") else cat_min
            )
        rows.append(SessionListItem(
            id=session.id,
            company=session.company,
            job_title=session.job_title,
            status=session.status.value,
            overall_score=session.overall_score,
            started_at=session.started_at,
            ended_at=session.ended_at,
            created_at=session.created_at,
            turns_evaluated=metrics.turns_evaluated if metrics else 0,
            total_filler_word_count=(
                metrics.total_filler_word_count if metrics else None
            ),
            filler_word_rate=filler_rate_pct(
                metrics.total_filler_word_count if metrics else None,
                metrics.total_word_count if metrics else None,
            ),
            averages=_averages_from_metrics(metrics),
            question_category=session_category,
        ))
    return rows


def _maybe_reap_stuck_session(
    session: InterviewSession,
    turns: list[InterviewTurn],
) -> None:
    """Lazily recover a session left `in_progress` by a dead finalizer.

    Two paths hand scoring to a detached `_run_background_finalize` task and
    return before it commits: the final-turn POST, and `POST /{id}/end` (early
    quit, graded on the completed turns). If the worker that spawned the task
    dies before it commits (deploy, crash, OOM) — or the task itself raised and
    left the session un-finalized — the row stays `in_progress` forever: there
    is no cron sweeper. Recover opportunistically on read.

    Fires once the session has NO pending (unanswered) turn and the grace
    window has elapsed. "No pending turn" is the general finalizable signal:
    mid-interview there is always a committed dangling next turn (the non-final
    branch inserts + commits it), so an `in_progress` session with every turn
    answered is either the final turn done (finalizer died) or an early-ended
    session whose trailing unanswered turn was trimmed — both should finalize.
    A candidate merely taking a long time still has their current turn as a
    NULL-transcript row, so they're never reaped mid-answer.

    Re-uses `_spawn_finalize`'s per-session dedup so it can never run alongside
    a finalizer this worker is already driving. `_run_background_finalize` is
    itself idempotent — it no-ops on a session that's since completed and only
    evaluates still-unscored turns — so a spurious re-spawn is harmless.
    """
    if session.status != SessionStatus.in_progress:
        return
    # Finalizable only once every turn is answered (no dangling unanswered
    # turn). The highest-numbered answered turn is the finalizer's anchor.
    final_turn = max(turns, key=lambda t: t.turn_number, default=None)
    if (
        final_turn is None
        or any(t.transcript_text is None for t in turns)
    ):
        return
    # Still within the window where a normal finalizer is expected to finish.
    # `updated_at` comes back tz-aware from Postgres (timestamptz); normalize to
    # naive UTC so it subtracts cleanly against naive `utcnow()`.
    last_activity = session.updated_at
    if last_activity.tzinfo is not None:
        last_activity = last_activity.astimezone(timezone.utc).replace(tzinfo=None)
    if datetime.utcnow() - last_activity < _FINALIZE_REAP_AFTER:
        return
    if session.id in _finalizing_sessions:
        return

    logger.warning(
        "Lazy-reaping stuck session=%s (in_progress, last activity %s); "
        "re-spawning finalization.",
        session.id,
        session.updated_at,
    )
    brief = _parse_company_summary(session.company_summary)
    _spawn_finalize(
        session_id=session.id,
        final_turn_id=final_turn.id,
        category=brief.category if brief else None,
        experience_level=session.experience_level,
        jd_summary=brief.jd_summary if brief else None,
    )


@router.get("/{session_id}", response_model=SessionDetailOut)
async def get_session(
    session_id: UUID,
    user: User = Depends(get_current_user_db),
    db: AsyncSession = Depends(get_db),
) -> SessionDetailOut:
    """Full session payload: session row + ordered turns + cached metrics.

    Ownership check happens BEFORE we fetch turns so an unauthorized
    request can't probe for another user's row counts via timing.
    """
    session = await db.get(InterviewSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    turns_result = await db.execute(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == session_id)
        .order_by(InterviewTurn.turn_number)
    )
    turns = list(turns_result.scalars().all())

    # Self-heal a session whose background finalizer never completed. This
    # read returns the still-`in_progress` payload as usual; the re-spawned
    # task flips it to `completed` out of band, and the client's poll picks
    # up the scores on a subsequent fetch.
    _maybe_reap_stuck_session(session, turns)

    metrics_result = await db.execute(
        select(SessionMetrics).where(SessionMetrics.session_id == session_id)
    )
    metrics = metrics_result.scalar_one_or_none()

    turn_outs = [
        TurnOut(
            id=t.id,
            turn_number=t.turn_number,
            question_text=t.question_text,
            transcript_text=t.transcript_text,
            is_followup=t.is_followup,
            question_category=t.question_category.value,
            scores=ScoresOut(
                # `0` is a valid evaluator score, so null must round-trip as
                # null — not coerced to 0 — otherwise the UI can't tell an
                # unevaluated turn from a 0/10 score, and the per-session
                # average gets dragged down by phantom zeros. The frontend
                # renders an "Evaluation Failed" placeholder for null rows.
                dimension_1=int(t.dimension_1_score) if t.dimension_1_score is not None else None,
                dimension_2=int(t.dimension_2_score) if t.dimension_2_score is not None else None,
                dimension_3=int(t.dimension_3_score) if t.dimension_3_score is not None else None,
                dimension_4=int(t.dimension_4_score) if t.dimension_4_score is not None else None,
                dimension_5=int(t.dimension_5_score) if t.dimension_5_score is not None else None,
                delivery=int(t.delivery_score) if t.delivery_score is not None else None,
            ),
            feedback=t.feedback,
            feedback_detail=t.feedback_detail,
            filler_word_count=t.filler_word_count or 0,
            filler_word_breakdown=t.filler_word_breakdown or {},
            filler_word_rate=filler_rate_pct(t.filler_word_count, t.word_count),
            word_count=t.word_count or 0,
            duration_seconds=t.duration_seconds,
            speaking_pace_wpm=speaking_pace_wpm(t.word_count, t.duration_seconds),
            evaluated_at=t.evaluated_at,
            created_at=t.created_at,
        )
        for t in turns
    ]

    return SessionDetailOut(
        id=session.id,
        company=session.company,
        job_title=session.job_title,
        num_turns=session.num_turns,
        status=session.status.value,
        overall_score=session.overall_score,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        summary=_parse_company_summary(session.company_summary),
        turns=turn_outs,
        averages=_averages_from_metrics(metrics),
        total_filler_word_count=(
            metrics.total_filler_word_count if metrics else None
        ),
        filler_word_rate=filler_rate_pct(
            metrics.total_filler_word_count if metrics else None,
            metrics.total_word_count if metrics else None,
        ),
        speaking_pace_wpm=speaking_pace_wpm(
            metrics.total_word_count if metrics else None,
            metrics.total_duration_seconds if metrics else None,
        ),
        turns_evaluated=metrics.turns_evaluated if metrics else 0,
        saved_question_id=session.saved_question_id,
        calibrated_mix=session.calibrated_mix,
    )
