# InterviewPie: AI Behavioral Interview Coach

MVP: Voice-in → transcript → LLM scoring + follow-up → ElevenLabs voice-out → metrics + incidents persisted.

## What the MVP ships

- **Personalization from a resume.** Onboarding ingests PDF resume + short bio → `resume_text`, `target_role`, `industry`, `experience_level`. Every downstream prompt conditioned on this profile.

- **Industry & role autocomplete (required-selection combobox).** `/api/v1/validation/industries?q=` and `/api/v1/validation/roles?q=&industry=` → `SuggestionsOut { suggestions: str[≤5], flagged, message }`. Three-stage pipeline (order is load-bearing — moderation MUST precede LLM): (1) deterministic `_looks_like_junk` reject → empty, no network; (2) OpenAI `check_moderation` → empty + `flagged=True` on block; moderation outage raises `ModerationUnavailableError` → empty (unmoderated input never reaches LLM); (3) LLM `google/gemini-2.5-flash-lite` → `openai/gpt-oss-120b` fallback, JSON `{"suggestions":[...]}`, ≤5 unique Title-Case strings. Fails soft → empty. Suggestions are **semantic not literal completions**. Role conditioned on chosen industry (empty → industry-agnostic). UI: `SuggestionCombobox.tsx` (ARIA listbox, 350ms debounce via `useDebouncedValue`) wrapped by `IndustryAutocompleteField`/`RoleAutocompleteField`. **Required selection** — free-typed text never advances, editing re-arms; gate is client-side only. Validation `category` no longer returned (recomputed at session time by `company_research`).

- **Voice dictation for the bio field (browser-native Web Speech API).** Deliberately **NOT** ElevenLabs STT (wrong shape for inline textbox). Three pieces:
  - `useSpeechRecognition.ts` — `continuous=true`, `interimResults=true`; `onend` auto-restart gated by `wantListeningRef`; `not-allowed`/`service-not-allowed` → error + stop; `no-speech`/`aborted` ignored.
  - `SpeechToTextButton.tsx` — **renders `null` when `!supported`** (Firefox). Does NOT own the bio value.
  - `joinSpoken.ts` — `joinSpoken(prev, chunk)` merges finalized chunks (single space, clamp to `MAX_BIO_LENGTH = 2000`). **Interim text never committed.** Own module for `react-refresh/only-export-components`.

- **Field-tailored opening question AND evaluator rubric.** 15 field buckets: Tech/Product/Design, Data/AI/ML, Cybersecurity, Finance, Consulting, Legal, Government, Healthcare, Sales/Marketing, Ops/Supply Chain, Retail/Hospitality, Nonprofit, Education, Non-Software Engineering, Startups. Classified by job title (primary), company (secondary). Category drives (1) opening-question prompt (`_field_prompts.py`) and (2) evaluator rubric (`_field_rubrics.py`). Source-of-truth markdown: `backend/prompts/opening_question_prompts.md`, `evaluator_prompts.md` — **keep Python and markdown in sync**.

- **Experience-level tailoring (second axis).** `ExperienceLevel`: internship / entry / mid / senior / staff / executive. **15×6 matrix** via `experience_question_block(category, level)` / `experience_evaluator_block(category, level)`.
  - **Opening question** (`build_field_system_prompt`): experience block **leads as `PRIMARY DRIVER`**, `FIELD_THEMES` demoted to background. Shared `style_cues` keep the legacy `None` path byte-identical.
  - **Evaluator** (`build_system_instruction`): level paragraph appended, keyed on same resolved `key` as the rubric fallback.
  - `experience_level is None` (legacy) → byte-identical to category-only. Non-`ExperienceLevel` → `""` (fails soft).
  - **Source of truth:** `backend/prompts/experience_prompts.md`; `_experience_prompts.py` is **generated** via `python scripts/gen_experience_prompts.py` — don't hand-edit the `.py`. Import-time guard fails loud if any of the 90 cells is missing.

- **Research-inspired, per-session-varied opening question.**
  - `FIELD_EXAMPLES`: 5 per category, **2 randomly sampled per call** — breaks "fixed attractor" effect.
  - Two parallel Serper queries via `asyncio.gather`: `{company}` + `{company} {level_label} {job_title} behavioral interview culture`. Generic "interview questions" phrasing dropped — that corpus is LeetCode/system-design heavy and pulled `role_signals` technical.
  - `role_signals` = cultural/soft-skill traits (NO technical proficiencies); `sample_question_themes` = behavioral theme labels (NO technical themes, NO verbatim questions). Both default `[]`.
  - **Empty-omission pattern (load-bearing):** `_company_digest` surfaces these **only when non-empty** — reused by `followup.py` and `SessionDetail.tsx` Overview.
  - **Recent-questions avoid-list:** `users.recent_opening_questions` (JSONB, `'[]'` default, migration `0008_recent_opening_qs`) caches 3 most recent questions, newest-first. Injected into user prompt as avoid-list (empty-omission). Rolled via `([opening_q] + old)[:3]`, **reassigned not mutated** (SQLAlchemy dirty-tracking). **Reset to `[]`** in `onboarding.py` whenever `target_role`/`industry`/`experience_level` changes. Not in `UserOut`.

- **Optional pasted job description (per-session).** Setup's Advanced panel takes an optional posting (`SessionCreateIn.job_description`, ≤6000 chars, mirrored client-side `MAX_JOB_DESCRIPTION_CHARS` in `AdvancedPanel.tsx`). When present it becomes the **sole research source** — `research_company(..., job_description=...)` **skips both Serper queries** and derives the brief from the posting via `_research_from_job_description` + `_JD_SYSTEM_INSTRUCTION` (same contract/category list/anti-hallucination posture as the Serper path, existence-validation dropped since the match-check already vetted the company; kept a separate static block for its own Gemini implicit-cache prefix). Brief cleanup is the shared `_normalize_brief_payload` (category fallback + list caps) used by both paths. `job_description.py` owns the two setup-time pieces, **all in `POST /sessions` before any billed call:**
  - **Gibberish gate** (`looks_like_gibberish`, free/local) → `422`. Conservative hard block — rejects only empty/no-letters, symbol-soup (alphabetic ratio `<0.45` over ≥40 chars), or low-entropy keysmash (≥24 letters, ≤4 distinct). Real postings always pass. **Can't reuse `_looks_like_junk`** (its >120-char reject kills every real JD).
  - **Profile↔JD match-check** (`check_job_description_match`, `openai/gpt-oss-120b:free`, low reasoning) → `409 {code: "job_description_mismatch", message}` on a clear mismatch (different professional domain, or company/posting obviously fake/joke). **Fails open** — any SDK/parse error returns a match so an LLM outage never blocks a real session (this is a UX guardrail, NOT a security boundary; injection + moderation are the hard blocks and run on the JD too). Skipped when `acknowledge_mismatch=true`.
  - **Acknowledge override:** frontend re-submits with `acknowledge_mismatch=true` (the `MismatchConfirmDialog` "Continue anyway" path); server skips the match-check and logs `job_description_mismatch_ack` (warning, `log_jd_mismatch_acknowledged`) for after-the-fact abuse visibility — the daily-session cap bounds spend.

- **Field-tailored, confusion-aware follow-up question.** `followup.py` (DeepSeek v4 Flash, no reasoning).
  - `generate_followup` accepts `category`, `role_signals`, `sample_question_themes`, `experience_level` (all default `None` — legacy `brief_out is None` sessions work). Experience level is one calibration line, not a matrix lookup.
  - **Confused-candidate rule:** off-topic/nonsensical/single-word → gently redirect concretely; do NOT echo back or pretend it was substantive.
  - Output through `_sanitize_followup` (strips wrap-quotes, `Question:`/`Q:`/`Follow-up:` labels, asterisks). **A "drop preamble" trimmer was DELIBERATELY NOT added** (false-positives on legit framings); meta-reasoning suppression lives in the prompt.

- **Two-turn interview session with auto-submit.** 1 opening + 1 follow-up (locked). Auto-Submit toggle persisted (`auto_submit_enabled`). Both lock with `disabled={submitting}`.
  - **Recording length cap (5 min).** `Practice.tsx` auto-ends at 5:00 via `handleEnd` (preserves auto-submit vs. manual-preview). `RecordingNotice` warns at 4:00, countdown from 4:30. Server-side backstop: `_read_audio_bounded` hard cap **50 MiB** → `413`.
  - **Async final feedback (intentional).** Final-turn POST persists transcript/filler counts/`cv_summary`, starts `_run_background_finalize`, returns `is_final=true`, `evaluation_pending=true`, `scores=null`. Practice polls `GET /sessions/{id}` until `status === "completed"`. While pending, null scores = "Scoring in progress"; only after completed do null scores = "Evaluation failed".

- **Six scoring metrics per turn.** Five content scores (`structure`, `problem_solving`, `impact`, `initiative`, `depth`) + `delivery` (server-side from webcam analytics). Criteria from `_field_rubrics.py` by category. `delivery` is `null` when camera declined. **All five base scores nullable** (`int | None = None`) — failed eval → null. **Do not re-introduce `int(t.structure_score or 0)` coercion** — causes "0 0 0 0 0" failure-masking bug.

- **Balanced structured feedback per turn.** `positive_moments`, `main_takeaway`, `improvement_moments`, `quick_wins`. Moments quote exact transcript snippets. Legacy `coaching_moments` accepted as fallback.
  - **Char budgets stated TWICE** — prompt (snippet 120, keep_doing/main_takeaway 240, prose 330) AND Pydantic schema (~30 chars headroom: 270/270/390). `BeforeValidator` truncator clips overflow. `transcript_snippet` truncates without ellipsis (stays a substring, survives `_drop_unanchored_moments`). **When changing a cap, change BOTH `evaluator_prompts.md` AND `evaluator.py`.**
  - **Empty positives for non-answers:** unintelligible/off-topic/inappropriate → `positive_moments: []`; "still include one positive" clause only for weak-but-genuine attempts.
  - **Distinct snippets across `improvement_moments`:** exact-string equality only (substring/overlap dedup deliberately NOT added); first-occurrence wins, both lists.

- **Deterministic post-LLM score calibration.** `_calibrate_content_scores` only ever **LOWERS**. Word-count caps: `0` words → all `0`; `<10` → cap `2`; `<25` → cap `4`. Per-dimension evidence caps: no `_STRUCTURE_RE` → `structure ≤ 8`; no `_REASONING_RE` → `problem_solving ≤ 8`; no `_RESULT_RE` AND no `_NUMBER_RE` → `impact ≤ 6` (result w/o number → `≤ 8`); no `_OWNERSHIP_RE` → `initiative ≤ 8`. **`depth` has NO evidence cap** (old regexes were tech-keyword-biased; steered by prompt only). **When changing a cap, change all three:** `evaluator.py`, `evaluator_prompts.md`, and calibration block in `_field_rubrics.py`.

- **Prompt-injection hardening.** Two layers: deterministic `CONTENT_INJECTION_RE` (high-precision, hard-block safe) + delimiters + untrusted-data system clause (catches obfuscation/novel attacks). Canonical regex: `app/services/_injection.py`, **mirrored by hand** in `frontend/src/lib/contentPolicy.ts`. Regex **deliberately excludes** false-positive traps in genuine answers: bare `DAN`, `system update`, bare `act as`/`pretend to be`, generic `no restrictions`. **Weigh false-positive cost before adding a marker** — gates are destructive (422 blocks real recordings/bios).
  - **Evaluator**: transcript + prior answers in `<candidate_answer>` tags + `_INJECTION_SYSTEM_CLAUSE`; regex gate returns `_injection_nonanswer()` (scores `0`) before LLM spend. Kept as backstop — `submit_turn` now 422s injected transcripts first.
  - **Opening/followup/coaching**: user text in `<candidate_profile>`/`<candidate_answer>` tags; regex backstop — opening proceeds (tripwire + `log_incident`), followup returns `_FALLBACK`, coaching returns `None`.
  - **Input boundaries:** `submit_turn` 422s injected transcript; `onboarding` 422s injected `short_bio`/résumé (authoritative for PDF-extracted text); `company` capped at 60 chars; bio + pasted-résumé gated client-side via `contentPolicy.ts`. `_looks_like_junk` uses shared regex + bare `\bact as\b` (strict — suspicious in a 2-word field).

- **Delivery score + structured delivery feedback (server-side, never LLM).** `_compute_delivery_score(cv_summary)` deterministic from MediaPipe webcam analytics. **LLM not given webcam analytics**; `cv_summary` used only after LLM returns. Hard caps on `looked_away_pct`, `face_visible_pct`, bad posture/head-tilt. **Facial energy is deliberately one soft channel** — `low_energy_pct`/streak are coaching diagnostics only (no deductions/caps). Browser `low_energy` requires all three flat signals (`expression < 32`, `smile < 20`, mouth openness `< .028`). `_build_delivery_feedback`: `summary` + optional `eye_contact`/`alignment`/`posture`/`expression` cues (each ≤270 chars). Omitted when no `cv_summary`.

- **Browser-local face calibration.** `/calibrate?from=onboarding` (optional). Six-second capture → bounded gaze/camera-angle/neutral-expression ratios in `localStorage face_delivery_calibration` (raw frames discarded). `useFaceAnalyzer` passes profile into `FrameSummary` adjusting delivery aggregates before `cv_summary` posted. No-calibration → frozen fallback constants.

- **History + per-metric improvement tracking.** Completed sessions persist turns/scores/aggregates to Postgres. `/me/stats` for per-metric trends.

- **Save & re-practice opening questions.** Up to **5** opening questions (never follow-ups) as frozen snapshots. Table `saved_questions` (migration `0010_saved_questions`, `down_revision='0009_incidents'`). Sessions gain `experience_level` (stamped at create) and `saved_question_id` (FK → `saved_questions.id` ON DELETE SET NULL). Router: `app/api/v1/endpoints/saved_questions.py`, prefix `/saved-questions`.
  - **Re-practice skips LLM calls #1 and #2** (reads opening question and brief off frozen row); only TTS runs. Daily-limit gate still enforces before any spend. `_persist_session_and_turn(..., roll_recent=False, saved_question_id=sq.id, experience_level=sq.experience_level)`.
  - **Experience-level freeze (critical, repairs latent bug).** `submit_turn` previously read `experience_level` live off user row — changing level mid-session shifted rubric. Fix: stamped at create time, `submit_turn` reads `session.experience_level`.
  - **Saved questions deliberately survive profile drift** — NOT reset in `onboarding.py`. `SessionDetailOut` carries `saved_question_id`.
  - Endpoints: POST `""` save (409 at 5-cap, idempotent dedup on identical `question_text`, back-links originating session as attempt #1); GET `""` list; GET `/{id}` detail; DELETE `/{id}` (204, FK-null); POST `/{id}/practice` re-practice.

- **Ask Tutor — turn-scoped career-advisor chat (streamed, tool-calling).** A floating, non-modal chat on each SessionDetail turn tab. `tutor.py` (`deepseek/deepseek-v4-flash`, **no reasoning**). Helps the candidate understand their feedback, prep for the question type, reword phrasing, and strengthen stories — **scoped to ONE turn only**.
  - **Lean base context** (Flash degrades on long context): question, transcript, experience level, category, target role, main takeaway, and the turn's **per-dimension scores** rendered as a compact line (`_render_scores`; null → "not scored", never a fake number). Wrapped in delimiters + `_INJECTION_CLAUSE` (transcript/feedback/tool output are untrusted DATA).
  - **Three on-demand tools** keep base context small (`tool_specs`, no args; `run_tool` returns a slice of the loaded `TutorContext`, **no network** — latency is only model rounds): `get_improvement_moments`, `get_company_research`, `get_candidate_background`. Tool steps surface **live** in the chat ("Retrieving company brief…").
  - **Fully-streamed agent loop** (`stream_tutor_reply`, `stream=True`, ~4-round cap, `extra_body={"reasoning":{"enabled":False}}`). Yields typed events `{type: tool|token|done|error}`. **Fails soft** (mirrors `coaching.py`): any SDK/parse error → single `error` event, never raises into the response.
  - **Preamble suppression (load-bearing):** the model narrates tool use ("let me pull up…") in the SAME round it calls a tool — that chatty round's content is **dropped**; only the FINAL (no-tool) round's content streams to the user. Enforced by the loop (test: `test_stream_drops_tool_round_preamble`) AND the system prompt's "call tools silently / no preamble" rules.
  - **Stay-in-persona:** off-topic asks (joke, code, image, trivia) get EXACTLY the `REDIRECT_LINE` and nothing else.
  - **Constrained markdown:** the model may use ONLY `**bold**`, `*italic*`, hyphen bullets, and numbered lists — no headings/tables/code/blockquotes/links. Rendered by the frontend's `TutorMarkdown` (see `frontend/CLAUDE.md`). **Asterisks pass through verbatim** — this path has NO `_sanitize`-style asterisk stripper (unlike `followup.py`).
  - **Moderation precedes the stream:** each incoming message hits OpenAI moderation BEFORE the SSE opens → `flagged` returns a normal `422` (friendly tutor-bubble detail), outage → `503`; never a half-open stream.
  - **Abuse caps (client + server).** (1) **Per-message length:** typed `message` capped at **300 chars** — `TutorMessageIn.message` `max_length=300` (server) mirrored by the composer's `maxLength` + a near-limit char counter (`MAX_MESSAGE_CHARS`). The attached "Ask about this" `context_snippet` is a **separate field** (cap 2000) and is NOT counted toward the 300. (2) **Daily volume:** free-tier users get **10 successful completions per local day** (`DAILY_CHAT_LIMIT_FREE`), mirroring the session daily-limit pattern in `daily_limit.py` (NOT the epoch-aligned `rate_limit.py` — it can't express "midnight in the user's IANA tz"). Counter on `users.daily_chat_count` / `chat_count_reset_date`, rolled lazily via the same `_today_in_tz(user.timezone)` reset (zero-write steady state).
  - **Daily-limit mechanics (load-bearing):** the read-only `enforce_chat_daily_limit` pre-check runs in the endpoint **before** moderation/LLM spend → `429` when already at 10. The counter advances **only on a successful completion** — increment iff a `done` event fires (an upstream/SDK failure yields `error` + no `done`, so a failed reply is **not** charged). The increment (`record_chat_completion`) runs inside the SSE generator in its **own** `AsyncSessionLocal` session (past the request session's life, like incident logging) and injects `remaining` into the `done` event. `GET /me` rolls + returns `daily_chat_count`, so the frontend disables the composer + shows the red "resets at midnight" message at 0 and a muted "N left today" hint at ≤3, seeded from `/me` and updated live from `done.remaining`/`429`. Pro tier skips the gate (mirrors sessions).
  - **Ephemeral:** the backend persists NOTHING — the frontend holds the conversation in memory; leaving SessionDetail (a tab switch) discards it (blank slate on return). History is re-sent per request (text bubbles only; tool results re-fetched, never echoed) for multi-turn coherence.

- **Interview voices (ElevenLabs).** `VoicePicker` has preset voices + "Surprise me". Per-session choice.

- **Free tier with daily session limits.** 5 completed sessions per local calendar day. Counter increments at **finalization** (not creation — abandoning doesn't burn a slot). IANA timezone from browser (`users.timezone`, UTC fallback). Pre-check at `POST /sessions` **before** any LLM/API spend → 429. Race-safe atomic `UPDATE` in `daily_limit.py`. `GET /me` also runs `check_and_reset` — zero writes steady-state (UPDATE gated by `count_reset_date.is_distinct_from(today)`, NULL-safe). **Second daily limit, same module:** Ask Tutor chats are capped at **10 successful completions/day** (`daily_chat_count` / `chat_count_reset_date`, `check_and_reset_chat` / `enforce_chat_daily_limit` / `record_chat_completion`) — see the Ask Tutor bullet for the success-only-increment nuance. `GET /me` rolls both counters for free tier.

- **Incidents event log (internal/admin-only).** `user_created`, `user_signed_in`, `moderation_request`, `interview_session_started`, `save_question`, `injection_detected`, `job_description_mismatch_ack` (warning — user proceeded past a flagged JD↔profile mismatch; keeps JD + declared company/title for audit), `error`. Written in a fresh DB session (failures never break request). Payload caps: `sent_content` 10k, `error` 8k, large JSON 2k. Auth events backend-observed (no Clerk webhooks); `user_signed_in` dedupes by Clerk `claims.sid`. Moderation incidents log only on OpenAI API fire (not deterministic local rejects). **Moderation fails closed:** `ModerationUnavailableError` writes `error` incident; callers return 503; `ensure_moderation_configured()` aborts boot if `OPENAI_API_KEY` unset. `interview_session_started` logs only after session persistence. 5xx/unhandled errors → `error`; normal 4xx does not.

---

## Stack

- **Frontend**: React + Vite, Clerk (auth), recharts, MediaRecorder, MediaPipe (webcam delivery analytics)
- **Backend**: FastAPI, Alembic + Postgres, OpenAI Python SDK pointed at OpenRouter (`https://openrouter.ai/api/v1`)
- **APIs**: ElevenLabs (STT + TTS), OpenRouter (`deepseek/deepseek-v4-pro` evaluator (high reasoning, `deepseek/deepseek-v3.2` fallback), `google/gemini-2.5-flash` research, `google/gemini-3.5-flash` opening (minimal reasoning), `deepseek/deepseek-v4-flash` follow-up + coaching + Ask Tutor (all no reasoning), `google/gemini-2.5-flash-lite` autocomplete + `openai/gpt-oss-120b` fallback, `openai/gpt-oss-120b:free` JD↔profile match-check (low reasoning, fails open)), Serper
- **Auth**: Clerk JWT verified via `python-jose` against `CLERK_JWT_ISSUER` JWKS

---

## Architecture

```
Browser (React+Vite)
  │── Clerk JWT ──────────────────────► FastAPI
  │── MediaRecorder blob ─────────────► FastAPI
                                          │── ElevenLabs STT (audio → transcript)
                                          │── OpenRouter (DeepSeek v4 Pro evaluator, Gemini research + opening question, DeepSeek v4 Flash follow-up)
                                          │── ElevenLabs TTS (text → audio)
                                          │── Serper API (company research)
                                          └── Postgres (via Alembic)
```

**Up to five LLM calls per session via OpenRouter.** #1/#2 at session start; #3 after turn 1 (follow-up); #4 evaluates each turn in bg; #5 forward coaching right after #4. Turn 1 eval+coaching runs while user answers turn 2. Final-turn eval+coaching in `_run_background_finalize`, then metrics written + session → `completed`.

1. **Company research + field classification** (`google/gemini-2.5-flash`). Two parallel Serper queries → `CompanyBrief(description, headlines, values, category, role_signals, sample_question_themes)`. `category` ∈ 15 buckets. **When a job description is pasted, Serper is skipped** and the brief is derived from the posting alone (`_research_from_job_description` + `_JD_SYSTEM_INSTRUCTION`); both paths funnel through `_normalize_brief_payload`. A separate cheap match-check (`openai/gpt-oss-120b:free`, low reasoning, fails open) screens the JD↔profile pairing first — see the "Optional pasted job description" MVP bullet.
2. **Opening question** (`google/gemini-3.5-flash`, minimal reasoning). System by `build_field_system_prompt(brief.category, rng=None)`; user prompt appends `role_signals`/`sample_question_themes` only when non-empty.
3. **Follow-up question** (non-final turns, `deepseek/deepseek-v4-flash`, no reasoning). System = hard rules (10–25 words, references something concrete, ends in `?`) + confused-candidate + output-format; output through `_sanitize_followup`.
4. **Evaluate** (`deepseek/deepseek-v4-pro`, high reasoning, `deepseek/deepseek-v3.2` fallback, JSON mode, detached bg task). Rubric from `_field_rubrics.FIELD_RUBRICS` keyed on `brief.category`.
5. **Forward coaching** (`deepseek/deepseek-v4-flash`, no reasoning, `coaching.py:generate_next_take`, JSON mode). Deliberately SEPARATE call (NOT folded into evaluator's LOCKED prompt). Input: question + transcript + `main_takeaway` + top `improvement_moments`. Writes `feedback_detail.next_take` (`NextTake{focus, approach}`). **Fails soft**: any error → `next_take` null, scoring unaffected.

---

## Data Model

```sql
users(id, clerk_user_id UNIQUE, email, name, resume_text, industry, target_role, experience_level, short_bio, completed_registration,
tier user_tier DEFAULT 'free', daily_session_count INT DEFAULT 0, count_reset_date DATE NULL, timezone TEXT NULL,
daily_chat_count INT DEFAULT 0, chat_count_reset_date DATE NULL,  -- Ask Tutor daily cap (10/day free); same tz reset as sessions (migration 0017)
recent_opening_questions JSONB DEFAULT '[]', created_at, updated_at)

interview_sessions(id, user_id FK, config_id FK, status, company, job_title, company_summary, overall_score, notes,
experience_level experience_level NULL, saved_question_id UUID FK saved_questions.id ON DELETE SET NULL NULL,
started_at, ended_at, created_at, updated_at)

saved_questions(id, user_id FK users.id ON DELETE CASCADE, question_text, company, job_title, category TEXT NULL,
company_summary TEXT NULL, role_signals JSONB DEFAULT '[]', sample_question_themes JSONB DEFAULT '[]',
experience_level experience_level NULL, created_at)  -- frozen snapshot; experience_level reuses the PG enum (create_type=False)

interview_configs(id, user_id FK, company, job_title, job_description, company_context, interview_type, num_turns, ai_plan, created_at)

interview_turns(id, session_id FK, turn_number, question_text, transcript_text, is_followup, parent_turn_id FK,
structure_score INT, problem_solving_score INT, initiative_score INT, impact_score INT, depth_score INT,
delivery_score INT NULL, feedback TEXT NULL, feedback_detail JSONB NULL,
filler_word_count INT, filler_word_breakdown JSONB, word_count INT NOT NULL DEFAULT 0, cv_summary JSONB NULL, ai_model_used, evaluated_at, created_at)

session_metrics(id, session_id FK, avg_structure, avg_problem_solving, avg_initiative, avg_impact, avg_depth, avg_delivery, total_filler_word_count, total_word_count INT NULL, overall_score, turns_evaluated, generated_at)

incidents(id, event_type, severity, user_id FK NULL, clerk_user_id TEXT NULL, session_id FK NULL, occurred_at,
idempotency_key UNIQUE NULL, sent_content TEXT NULL, returned_content JSONB NULL, error TEXT NULL, metadata JSONB DEFAULT '{}')
```

---

## API Routes

All routes except `/health` require Clerk JWT via a FastAPI dependency.

```
POST /onboarding              { resume_file, industry, target_role, short_bio }
POST /sessions                { company, job_title, voice_id?, timezone?, job_description? (≤6000), acknowledge_mismatch? } → 201 { session_id, summary, first_question, first_question_audio_url } | 422 (JD gibberish) | 409 { code:"job_description_mismatch", message } (JD↔profile mismatch; re-submit with acknowledge_mismatch=true) | 429 (daily limit)
POST /sessions/{id}/turns     { audio_blob, cv_summary? } → { transcript, scores|null, feedback|null, feedback_detail|null, next_question, next_question_audio_url, is_final, evaluation_pending }
GET  /sessions/{id}           full session + turns (incl. saved_question_id)
GET  /sessions                user's session history
GET  /me                      current user row (tier + daily_session_count + daily_chat_count; rolls both daily counters for free tier)
GET  /me/stats                aggregate scores over time

POST   /saved-questions             { session_id } → 201 SavedQuestionOut | 404 | 422 (not completed / opening turn unscored) | 409 (5-cap)
GET    /saved-questions             caller's saved questions + per-question aggregates (attempt_count, last_practiced_at, avg_overall_score)
GET    /saved-questions/{id}        frozen question + summary + attempts[] (per-attempt opening-turn scores, evaluation_failed)
DELETE /saved-questions/{id}        → 204 (linked sessions survive — FK ON DELETE SET NULL)
POST   /saved-questions/{id}/practice  { voice_id?, timezone? } → SessionCreateOut (re-practice; skips research/question LLM calls) | 429 (daily limit)

POST /sessions/{id}/turns/{turn_id}/tutor  { message (≤300 chars), history[], context_snippet? } → text/event-stream (SSE: tool|token|done|error; `done` carries `remaining` for free tier) | 404 | 422 (moderation block / message too long) | 429 (daily chat cap) | 503 (moderation down). Ephemeral — nothing persisted; 429 pre-check + the success-only increment are the daily-limit gate.
```

`timezone` is an IANA name from `Intl.DateTimeFormat().resolvedOptions().timeZone`, persisted on `users.timezone`. Missing/unparseable → UTC. TTS audio: base64 inline in JSON — no S3.

---

## Evaluator Schema (LOCKED — do not drift)

```json
{
  "structure": 0,
  "problem_solving": 0,
  "impact": 0,
  "initiative": 0,
  "depth": 0,
  "delivery": 0,
  "feedback_detail": {
    "positive_moments": [
      {
        "transcript_snippet": "exact copied phrase",
        "why_this_helped": "short specific reason this worked",
        "keep_doing": "short coaching reinforcement"
      }
    ],
    "main_takeaway": "one short sentence about the biggest improvement opportunity",
    "improvement_moments": [
      {
        "transcript_snippet": "exact copied phrase",
        "issue_type": "missing_detail | missing_result | missing_reasoning | rambling | unprofessional | does_not_answer_question | weak_wording",
        "why_this_weakened": "short practical explanation",
        "how_to_strengthen": "specific bite-sized suggestion, not a full rewritten answer"
      }
    ],
    "quick_wins": ["one keep-doing bullet", "one short practical fix"],
    "delivery_feedback": {
      "summary": "one-line headline naming the biggest visible delivery issue",
      "eye_contact": "optional cue (or null)",
      "alignment": "optional cue (or null)",
      "posture": "optional cue (or null)",
      "expression": "optional cue (or null)"
    }
  },
  "notes": "short backward-compatible summary for older clients"
}
```

- **Models:** Evaluator → `deepseek/deepseek-v4-pro` (high reasoning, `deepseek/deepseek-v3.2` fallback). Research → `google/gemini-2.5-flash`; opening → `google/gemini-3.5-flash` (minimal reasoning); follow-up → `deepseek/deepseek-v4-flash` (no reasoning). No other model mixing.
- **Scores:** five content dims LLM-scored 0–10 ints, then `_calibrate_content_scores` (only lowers); `delivery` computed server-side by `_compute_delivery_score` (never trusted from the model). All six nullable on the wire.
- **Delivery feedback:** built server-side from `cv_summary` (never LLM, not in prompt); omitted when camera declined. `summary` required; four cues optional, each ≤270 chars.
- **Forward coaching:** `feedback_detail.next_take` (`{focus ≤270, approach ≤390}`) NOT from evaluator — written by coaching call (#5) and merged before persistence. Null on legacy turns / coaching failure.
- **Feedback caps:** `positive_moments` ≤ 3, `improvement_moments` ≤ 4, `quick_wins` ≤ 3. Server-side: drop moments whose `transcript_snippet` isn't an exact substring, then `_dedupe_by_snippet` (exact equality, first-occurrence wins) on both lists. **This exact-substring anchoring is now also load-bearing for the frontend** — `QuestionAnswerCard` locates each improvement snippet in the transcript (trimmed `indexOf`) to highlight it inline + make it click-to-jump; relaxing the anchoring silently breaks that highlighting (see `frontend/CLAUDE.md` → "Transcript feedback highlighting").
- **Legacy:** `notes` persisted in `interview_turns.feedback`. `feedback_detail.coaching_moments` normalized into `improvement_moments`.
- Pass full turn history in prompt so follow-ups reference earlier answers. Filler regex is ground truth; LLM breakdown supplemental.

**Filler word regex** (case-insensitive, word boundaries): `um, uh, er, like, you know, basically, literally, actually, i mean, kind of, sort of, right`

**Filler-word RATE (fillers ÷ total words).** `interview_turns.word_count` (NOT NULL DEFAULT 0, `count_words()` whitespace tokenization) and `session_metrics.total_word_count` (nullable). Migration `0011_word_counts` (`down_revision='0010_saved_questions'`); both backfilled from existing `transcript_text`. Rate not stored — derived via `filler_rate_pct(filler, words)` (`Decimal` percent, 1 dp, `None` when no words). Multi-word filler ("you know") = 1 filler but 2 words → rate marginally conservative (accepted). `MeStatsOut.filler_word_rate`: lifetime **word-weighted** Σfillers/Σwords (not mean of per-session rates). **Frontend traffic-light bands** (`fillerRateColor`): ≤5% green, ≤10% yellow, ≤15% orange, >15% red — rendered by `FillerRateBar` (proportional fill capped at 20%).

---

## Session Rules

- **2 turns fixed**: 1 opening + 1 follow-up (hardcoded end condition). `is_final: true` on turn 2; `next_question` is empty string.

---

## Auth Implementation

`current_user(authorization: str = Header(...)) -> ClerkClaims` verifies Bearer JWT against `CLERK_JWT_ISSUER` JWKS via `python-jose`. `get_current_user_db(...) -> User` upserts by `clerk_user_id`, stamps `request.state.user_id`/`clerk_user_id`, logs `user_created` on first row, logs `user_signed_in` once per Clerk `claims.sid`. No Clerk webhooks required.

---

## Env Vars

```
DATABASE_URL
CLERK_SECRET_KEY
CLERK_JWT_ISSUER
OPENROUTER_API_KEY      # single key for all LLM calls
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID     # default voice; per-session override via VoicePicker
SERPER_API_KEY
```

---

## Frontend Routing

**React Router v7** (declarative `<BrowserRouter>`, not the data router). Route table in `frontend/src/App.tsx`.

Routes: `/` → `HomeRoute` (auth-bivalent); `/sign-in`, `/sign-up` (both `RedirectIfOnboarded`); `/onboarding` (`RequireAuth` + `RedirectIfOnboarded`); `/practice`, `/history`, `/sessions/:id`, `/personalize` (all `RequireAuth` + `RequireOnboarded`); `/calibrate` (`RequireAuth`); `/sso-callback` (none); `*` → `<Navigate to="/">`.

**Route guards** (`route-guards.tsx`): each waits for Clerk `isLoaded` AND `useMe().isReady`. `RequireAuth` → `/sign-in`; `RequireOnboarded` → `/onboarding`; `RedirectIfOnboarded` → `/`. `HomeRoute`: signed-out → `<Hero />`; signed-in + not onboarded → `/onboarding`; onboarded → `<Home />`.

**TopBar nav:** `TopBarNavLink` active via `matchPath` + optional `matchPatterns?: string[]` (Practice: `to="/" matchPatterns={['/practice']}`; History: `to="/history" matchPatterns={['/sessions/:id']}`).

**Setup → Practice handoff:** `navigate("/practice", { state: { sessionId, firstQuestion, firstQuestionAudioUrl } })`; `Practice` reads `useLocation().state` on mount, missing → `<Navigate to="/" replace />`. `PracticeLocationState` also carries `company`/`jobTitle`.

**Flash messages:** `FlashBanner.tsx` watches `location.state.flash` via a **`useEffect`** (not a `useState` initializer — lets same-route re-navigations re-trigger), auto-dismiss 6s. Routing trade-off: gained deep-linking, lost the cross-route morph sweep (in-component morph for Practice's Interview → Results preserved).

### Practice + SessionDetail

- **`Practice.tsx`** is one mount hiding a two-branch state machine — Interview (`!isDone && currentQ`) and Results (`isDone`). One component because both branches share `sessionId`/`turnResults`/`recorder`/`analyzer`. Camera box locked to `w-[45vw]` desktop. Final-turn POST refetches session as `sessionDetail`; panels consume `effectiveTurns = sessionDetail?.turns ?? turnResults.map(replayToTurnDetail)` (renders even when refetch fails).
- **`SessionDetail.tsx`** (`/sessions/:id`): folder-tab (Overview, Turn 1, Turn 2). Tab reset on `sessionId` change uses **React-19 "compare prop to tracked state during render"** pattern, NOT a `useEffect` setState. Components under `frontend/src/components/session-detail/`; `_helpers.ts:SCORE_COLOR_MAP` mirrors `History.tsx:DIMENSIONS`. `formatIssueType(raw)`: snake_case → Title Case — don't hard-code a switch.

## Verification Checklist

- [ ] **Auth**: no/invalid JWT → 401, valid JWT → 200
- [ ] **Onboarding**: upload real PDF → `users.resume_text` non-empty and coherent
- [ ] **Evaluator contract**: canned transcript with 3 "um"s → `filler_word_count == 3`, all scores ints 0–10
- [ ] **Incidents**: first auth creates `user_created`; same Clerk `sid` dedupes `user_signed_in`; moderation hard-block writes `moderation_request` with `severity='warning'`; session start logs only after session row commit
- [ ] **E2E**: log in → onboard → start session ("Google") → complete turns aloud → summary shows non-zero scores → refresh → session appears
- [ ] **Failure mode**: kill ElevenLabs key mid-session → clear error, not blank screen
