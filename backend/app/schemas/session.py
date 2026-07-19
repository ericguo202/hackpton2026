"""
Pydantic request / response shapes for `/api/v1/sessions` (and the
`/api/v1/me/stats` aggregate that piggy-backs on the same data).

The response wraps a `CompanyBrief` (from `app.services.company_research`) as
`CompanyBriefOut` so the HTTP layer doesn't leak internal service imports
into OpenAPI tooling and we have a stable JSON contract even if the service
model grows fields over time.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.db.models.enums import QuestionCategory
from app.services._field_categories import FieldCategory
from app.services.voice_pool import DEFAULT_PACE, SpeechPace

# Question types with a real prompt stack. The Setup picker only offers these;
# a hand-crafted request naming an unbuilt type would generate STAR prompts
# mislabeled as that type, so the request layer rejects it. All four taxonomy
# types are built today; keep this gate (and extend it) if a new type is added.
BUILT_QUESTION_CATEGORIES = frozenset(
    {
        QuestionCategory.experience_star,
        QuestionCategory.motivation_fit,
        QuestionCategory.situational,
        QuestionCategory.self_assessment_growth,
    }
)


class SessionCreateIn(BaseModel):
    # 60 mirrors the client-side cap in Home.tsx — long enough for real names
    # ("New Jersey House of Representatives Internship Program"), short enough to
    # block a direct-API paste of a large blob that would burn research/LLM
    # tokens. A client maxLength alone is trivially bypassed, so enforce it here.
    company: str = Field(min_length=1, max_length=60)
    job_title: str = Field(min_length=1, max_length=200)
    # Optional ElevenLabs voice ID picked from the start-form picker. The
    # endpoint validates this against `voice_pool.is_valid_voice_id()` and
    # silently falls back to the deterministic-random voice when the
    # caller omits it (or sends an unknown ID), so older clients keep
    # working unchanged.
    voice_id: str | None = Field(default=None, max_length=64)
    # Per-session interview-voice pace from the setup toggle: "Normal" (default)
    # or "Slower" (aimed at non-native English speakers). NOT a raw float — the
    # actual `voice_settings.speed` is resolved PER VOICE server-side via
    # `voice_pool.resolve_speed(voice_id, pace)` (a global 1.1/0.9 reads very
    # differently across accents), then persisted on the session row.
    speech_pace: SpeechPace = DEFAULT_PACE
    # IANA timezone name from the browser (e.g. "America/New_York"), used
    # by the daily-limit gate to compute "today" in the user's local day.
    # Untrusted: the backend falls back to UTC if missing / unparseable so
    # a stale or stripped value can't block a legitimate session.
    timezone: str | None = Field(default=None, max_length=64)
    # Optional pasted job description. When present, it replaces Serper as the
    # research source for the company brief and triggers a profile-consistency
    # match-check. 6000 mirrors the client-side cap in AdvancedPanel.tsx; a
    # client maxLength alone is trivially bypassed, so enforce it here too.
    job_description: str | None = Field(default=None, max_length=6000)
    # Set by the frontend on the re-submit after the user confirms a flagged
    # role/industry/company ↔ job-description mismatch, so the server skips the
    # match-check and proceeds with session creation.
    acknowledge_mismatch: bool = Field(default=False)
    # Optional id of a candidate-authored custom question (from
    # /api/v1/custom-questions). When present, the session still runs company
    # research but SKIPS the opening-question LLM call — the custom question's
    # text becomes turn 1 verbatim (it was screened at creation time). 404 if it
    # isn't the caller's.
    custom_question_id: UUID | None = Field(default=None)
    # Total interview turns, including the opening question. Default preserves
    # the original 1 opening + 1 follow-up flow for older clients.
    num_turns: int = Field(default=2, ge=2, le=8)
    # Question FORM for this whole session (single-category per session). Chosen
    # in the Setup picker; stamped on turn 1 and inherited by every later turn.
    # Default keeps older clients (and re-practice / custom-question flows, which
    # never send it) on Experience/STAR. Only built types are accepted.
    question_category: QuestionCategory = QuestionCategory.experience_star
    # "Recommended Mix" mode. When true, `question_category` is IGNORED and each
    # story-block opening draws a category from the level+field calibrated weights
    # (`_category_weights`). Additive/back-compatible: older clients omit it and
    # keep the single-category behavior. Ignored for custom-question sessions
    # (forced to STAR verbatim).
    calibrated_mix: bool = Field(default=False)

    @field_validator("question_category")
    @classmethod
    def _only_built_categories(cls, v: QuestionCategory) -> QuestionCategory:
        if v not in BUILT_QUESTION_CATEGORIES:
            raise ValueError(f"question_category {v.value!r} is not available yet")
        return v


class CompanyBriefOut(BaseModel):
    description: str
    headlines: list[str]
    values: list[str] = []
    # Round-trips `CompanyBrief.category` from the persisted JSON so
    # downstream code (notably the evaluator) can re-derive the
    # field-tailored rubric. Optional for legacy rows persisted before
    # categorization existed.
    category: FieldCategory | None = None
    # Role-specific signals extracted from research — what the company
    # is documented to value in applicants for the candidate's target
    # role. Empty list when research found nothing concrete (small /
    # obscure companies); the opening-question generator MUST NOT
    # invent role framing in that case.
    role_signals: list[str] = []
    # Themes (NOT verbatim questions) drawn from any interview-question
    # leaks the role-targeted search surfaced. Empty list when no
    # interview content was found. Used by the opening-question
    # generator as inspiration only — the model is instructed to riff
    # off the theme, not copy the wording.
    sample_question_themes: list[str] = []
    # Role-focused operational facts distilled from a pasted job description
    # (solo vs. collaborative, scope, duties, expectations). Only populated on
    # sessions created with a pasted JD; `[]` otherwise and on legacy rows.
    # Rides inside the persisted `company_summary` JSON and is threaded into the
    # opening-question / follow-up / evaluator prompts (empty-omission gated).
    jd_summary: list[str] = []


class SessionCreateOut(BaseModel):
    session_id: UUID
    summary: CompanyBriefOut
    first_question: str
    # Question FORM of turn 1 — the session's chosen category (single-category
    # per session). Carried so the Practice recording view can badge turn 1 by
    # category. Defaulted so re-practice / custom-question call sites (always
    # STAR) need no change.
    first_question_category: str = "experience_star"
    num_turns: int
    # True when this session runs in "Recommended Mix" mode (each opening draws a
    # calibrated category). Lets the client render the session-level mix badge.
    calibrated_mix: bool = False
    # `data:audio/mpeg;base64,...` — ready to drop into `<audio src>`.
    # Not persisted; regenerated on demand per CLAUDE.md (audio inline in
    # JSON, no S3).
    first_question_audio_url: str


class ScoresOut(BaseModel):
    # Five GENERIC content score slots; the human label per position is resolved
    # client-side from the turn's `question_category` (see frontend
    # `SCORE_DIMENSIONS_BY_CATEGORY`). All are nullable: the route returns null
    # for any turn whose evaluation never completed (background + inline-fallback
    # both raised). The frontend renders an "Evaluation Failed" placeholder in
    # that case rather than displaying 0s that would drag the average down.
    dimension_1: int | None = None
    dimension_2: int | None = None
    dimension_3: int | None = None
    dimension_4: int | None = None
    dimension_5: int | None = None
    # 6th dimension from browser webcam analytics. Null when the candidate
    # declined camera access; the UI hides the row in that case.
    delivery: int | None = None


class PositiveMomentOut(BaseModel):
    transcript_snippet: str
    why_this_helped: str
    keep_doing: str


class ImprovementMomentOut(BaseModel):
    transcript_snippet: str
    issue_type: str
    why_this_weakened: str
    how_to_strengthen: str


class DeliveryFeedbackOut(BaseModel):
    summary: str
    eye_contact: str | None = None
    alignment: str | None = None
    posture: str | None = None
    expression: str | None = None


class NextTakeOut(BaseModel):
    focus: str
    approach: str


class FeedbackDetailOut(BaseModel):
    main_takeaway: str
    positive_moments: list[PositiveMomentOut] = Field(default_factory=list)
    improvement_moments: list[ImprovementMomentOut] = Field(default_factory=list)
    quick_wins: list[str] = Field(default_factory=list)
    delivery_feedback: DeliveryFeedbackOut | None = None
    # Forward coaching from the separate coaching call; null on legacy turns or
    # when the coaching call failed (it's best-effort).
    next_take: NextTakeOut | None = None

    @model_validator(mode="before")
    @classmethod
    def _legacy_coaching_moments(cls, data: object) -> object:
        if isinstance(data, dict) and "improvement_moments" not in data:
            legacy = data.get("coaching_moments")
            if legacy is not None:
                data = {**data, "improvement_moments": legacy}
        return data


class TurnSubmitOut(BaseModel):
    """Response shape for `POST /sessions/{id}/turns`.

    Evaluation runs in the background for every turn. Non-final turns return
    the next question immediately after STT + follow-up/TTS. Final turns return
    immediately after transcript persistence, then a background finalizer writes
    scores, aggregates, and flips the session to completed. Clients should poll
    `GET /sessions/{id}` while `evaluation_pending` is true.
    """

    transcript: str
    # Scores/feedback are only present once the evaluator has actually run.
    # Nullable so turn responses can return immediately while background
    # evaluation writes the canonical scores.
    scores: ScoresOut | None = None
    feedback: str | None = None
    feedback_detail: FeedbackDetailOut | None = None
    filler_word_count: int
    filler_word_breakdown: dict[str, int]
    next_question: str | None
    next_question_audio_url: str | None
    # True when the next question drills into the current story (a follow-up)
    # rather than opening a fresh story block. Lets Practice label the upcoming
    # question as a follow-up during recording. False on the final turn (no
    # next question) and whenever the next turn is a fresh opening.
    next_question_is_followup: bool = False
    # Question FORM of the next question (Experience/STAR today). Mirrors
    # `next_question_is_followup`; lets Practice badge the upcoming question by
    # category during recording. Empty-safe default for final/clarification returns.
    next_question_category: str = "experience_star"
    # True when the submitted audio was only a clarification request. The
    # backend re-asks the same turn more concretely and does not persist the
    # transcript, score the turn, or advance the turn count.
    clarification_retry: bool = False
    is_final: bool
    # True when the evaluator is still running in the background. The
    # frontend uses this to (a) avoid showing 0/10 placeholder bars on
    # turn 1 and (b) decide whether to refetch the session at finalize.
    evaluation_pending: bool = False


# ── History routes (GET /sessions, GET /sessions/{id}, GET /me/stats) ────────

# Per-dimension averages mirror the columns on `session_metrics`. All are
# nullable: a brand-new session may have no scored turns yet, and `delivery`
# is null whenever the candidate kept the camera off for every turn. The
# frontend trend chart drops null points instead of plotting them as zeros.
class DimensionAverages(BaseModel):
    # Generic per-dimension averages; label per position resolved client-side
    # from question_category. Aggregate surfaces (history trend, radar, stats)
    # currently render the STAR label set since all live turns are STAR.
    dimension_1: Decimal | None = None
    dimension_2: Decimal | None = None
    dimension_3: Decimal | None = None
    dimension_4: Decimal | None = None
    dimension_5: Decimal | None = None
    delivery: Decimal | None = None


class SessionListItem(BaseModel):
    """One row in the user's session-history list.

    Includes the cached per-dimension averages so the trend chart on the
    history page can render off a single `GET /sessions` response without
    fanning out to N detail calls.
    """

    id: UUID
    company: str
    job_title: str
    status: str
    overall_score: Decimal | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    turns_evaluated: int
    total_filler_word_count: int | None
    # Filler words as a percent of total words for this session (1 decimal).
    # Null for legacy rows with no cached word total. Drives the filler-rate
    # trend chart on the history page.
    filler_word_rate: Decimal | None = None
    averages: DimensionAverages
    # Session-level question category (the FORM axis), derived from the
    # session's turns: the single distinct turn category, or "mixed" for a
    # multi-category ("Recommended Mix") session. Null on a session with no
    # turns. Lets the History page filter the trend chart + list by category —
    # a single-category session's `averages` ARE that category's dimensions.
    question_category: str | None = None


class TurnOut(BaseModel):
    """One scored turn inside `SessionDetailOut`.

    `cv_summary` is intentionally excluded from this payload — the per-frame
    webcam blob is stored for later analytics but the delivery score already
    captures the signal the UI needs. Add it later if a per-turn delivery
    breakdown becomes part of the demo.
    """

    id: UUID
    turn_number: int
    question_text: str
    transcript_text: str | None
    is_followup: bool
    # Question FORM (Experience/STAR today) — drives the per-turn category badge
    # on the review cards. One of the `QuestionCategory` enum values.
    question_category: str = "experience_star"
    scores: ScoresOut
    feedback: str | None
    feedback_detail: FeedbackDetailOut | None = None
    filler_word_count: int
    filler_word_breakdown: dict[str, int]
    # Filler words as a percent of this turn's words (1 decimal). Null when
    # the turn has no transcript. Transcript-derived, so present even when the
    # LLM evaluation failed.
    filler_word_rate: Decimal | None = None
    evaluated_at: datetime | None
    created_at: datetime


class SessionDetailOut(BaseModel):
    """Full session payload for the per-session results screen."""

    id: UUID
    company: str
    job_title: str
    num_turns: int
    status: str
    overall_score: Decimal | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    # `interview_sessions.company_summary` is stored as serialized JSON.
    # We re-parse it here so the frontend gets the same `CompanyBriefOut`
    # shape it received from `POST /sessions`. May be null on legacy rows
    # or sessions where the brief failed to persist.
    summary: CompanyBriefOut | None
    turns: list[TurnOut]
    averages: DimensionAverages
    total_filler_word_count: int | None
    # Session-level filler rate (filler words / total words, percent), shown
    # on the Overview scores card. Null on legacy rows with no cached word total.
    filler_word_rate: Decimal | None = None
    turns_evaluated: int
    # Non-null when this session's opening question has been saved for
    # re-practice (either this is the baseline session that was saved, or a
    # re-practice attempt). Drives the Save button's "already saved" state so
    # the frontend doesn't need a separate lookup.
    saved_question_id: UUID | None = None
    # True when this session ran in "Recommended Mix" mode (openings drew
    # calibrated categories). The per-turn category badges already reflect each
    # turn's real category; this flags the session as a whole (e.g. for the
    # overview to show only the type-invariant tiles).
    calibrated_mix: bool = False


class SessionEndOut(BaseModel):
    """Response for `POST /sessions/{id}/end` (early finalize).

    The status is still `in_progress` here: the endpoint spawns the same
    detached finalizer the final-turn path uses and returns immediately, so
    the client navigates to the detail screen and polls until the background
    task flips the session to `completed`. `graded_turns` is the number of
    completed (transcript-bearing) turns the session will be scored on.
    """

    session_id: UUID
    status: str
    graded_turns: int


class FillerWordStat(BaseModel):
    """One row of the top-N filler-word leaderboard. Counts are exact ints."""

    word: str
    count: int


class CategoryStat(BaseModel):
    """Per-question-category rollup for the History strengths radar.

    Aggregated from `interview_turns` grouped by `question_category` (so it
    correctly spans "Recommended Mix" sessions, which mix categories per turn).
    `average_score` is the mean of the five content dimensions (0-10) across
    the category's scored turns — Delivery is excluded since it isn't a
    category-specific rubric dimension. `turns_evaluated` counts the scored
    turns (`dimension_1_score IS NOT NULL`). A category with no scored turns is
    simply absent from the list; the frontend plots it as 0.
    """

    question_category: str
    average_score: Decimal | None
    turns_evaluated: int


class MeStatsOut(BaseModel):
    """User-level rolling aggregates across all completed sessions.

    Powers a small profile/header strip on the history page (e.g.
    "5 sessions · avg STAR 7.2 · 38 filler words").
    """

    total_sessions: int
    completed_sessions: int
    total_turns_evaluated: int
    total_filler_word_count: int
    # Lifetime total spoken word count across completed sessions — the
    # denominator behind `filler_word_rate`.
    total_word_count: int
    # Lifetime filler rate (filler words / total words, percent, 1 decimal),
    # word-weighted across all completed sessions. Null until the user has
    # logged any words. The history page shows this as the headline filler
    # stat with the raw count as the secondary hint.
    filler_word_rate: Decimal | None
    averages: DimensionAverages
    # Average of the per-session `overall_score` (0-100 scale) across all
    # completed sessions. Null until the user finishes their first session.
    average_overall_score: Decimal | None
    # Top-5 most-used filler words across the caller's completed sessions,
    # aggregated at query time from per-turn interview_turns.filler_word_breakdown.
    # Ordered count-desc, then word-asc for stable ties. Empty until the user
    # logs at least one filler word.
    top_filler_words: list[FillerWordStat] = []
    # Per-question-category rollup (avg content score + turns evaluated), for the
    # History strengths-radar's category-comparison view. Always spans ALL
    # categories the user has scored turns in, honoring only the company/role
    # filters (NOT the `question_category` filter). Empty until any turn scores.
    by_category: list[CategoryStat] = []
