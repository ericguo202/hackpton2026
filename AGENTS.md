# Logos: AI Behavioral Interview Coach

MVP: Voice-in → transcript → LLM scoring + follow-up → ElevenLabs voice-out → metrics persisted.
Future: terms/conditions, security, LiveAvatar, gamification with XP.

## What the MVP ships

- **Personalization from a resume.** Onboarding ingests a PDF resume + short bio, extracts `resume_text`, stores target role / industry / experience level. Every downstream prompt (opening question, follow-up, evaluator) is conditioned on this profile.

- **Industry & role autocomplete (required-selection combobox).** Onboarding + Personalize fill `industry` / `target_role` via a dropdown backed by `/api/v1/validation/industries?q=` and `/api/v1/validation/roles?q=&industry=` (returns `SuggestionsOut { suggestions: str[≤5], flagged, message }`). Replaced the older classify-what-you-typed validation (too slow). `app/services/profile_validation.py:suggest_industries / suggest_roles` run a three-stage pipeline (moderation MUST precede the billed LLM): (1) deterministic reject `_looks_like_junk` (empty / prompt-injection / direct-request / gibberish / overlong) → empty list, no network; (2) OpenAI `check_moderation` → `flagged=True` + empty list on hard-block; (3) LLM completion on `google/gemini-2.5-flash-lite` (primary) falling back to `openai/gpt-oss-120b`, JSON-only `{"suggestions":[...]}`, sanitized to ≤5 unique Title-Case strings. **Everything fails soft** — missing key / timeout / parse error → empty list. Suggestions are **semantic, not literal completions** (industry "computers" → Software / Cybersecurity / IT; role "software" → Software Developer / Full-Stack Developer / Backend Engineer); model is told to include a normalized version of the user's input as an escape hatch. **Role suggestions conditioned on the chosen industry** (empty → industry-agnostic). UI: shared `frontend/src/components/SuggestionCombobox.tsx` (ARIA listbox, 350ms debounce via `useDebouncedValue`) wrapped by `IndustryAutocompleteField` / `RoleAutocompleteField`. **Required selection** — satisfied only once a suggestion is picked (`selected` boolean gate); free-typed text never advances, editing re-arms it; picking in onboarding auto-advances the step. Validation `category` no longer returned (recomputed at session time by `company_research`). Gate is client-side only.

- **Voice dictation for the bio field (browser-native, free, progressive enhancement).** The "Tell us about you" `<textarea>` (Onboarding step 3 AND Personalize, same `short_bio`) offers an optional mic via the **Web Speech API** (`window.SpeechRecognition ?? window.webkitSpeechRecognition`) — no API key, no backend round-trip, live interim results, needs HTTPS + one-time mic grant. Deliberately **NOT** the ElevenLabs STT path (record-blob-then-upload, wrong shape for an inline textbox). Three pieces:
  - `frontend/src/hooks/useSpeechRecognition.ts` — wrapper. `lang='en-US'`, `continuous=true`, `interimResults=true`. Returns `{ supported, listening, interim, error, start, stop, toggle }`. `onResult` fires once per **finalized** phrase, held in a **ref refreshed every render** (freshest closure without re-binding). In `continuous` mode Chrome fires `onend` after a pause — a `wantListeningRef` gates auto-restart until the user explicitly stops. `not-allowed` / `service-not-allowed` set a gentle `error` and stop; `no-speech` / `aborted` ignored. Local TS decls scoped to the file.
  - `frontend/src/components/SpeechToTextButton.tsx` — self-contained mic toggle reused by both forms (idle = `Mic` "Dictate", listening = pulsing `Square` "Stop", `aria-pressed`) + greyed interim preview + permission-error notice. **Renders `null` when `!supported`** (Firefox). Does NOT own the bio value.
  - `frontend/src/lib/joinSpoken.ts` — `joinSpoken(prev, chunk)` merges each finalized chunk into the controlled value (single separating space, clamped to `MAX_BIO_LENGTH = 2000`). Both forms wire `onAppend={(chunk) => setShortBio((prev) => joinSpoken(prev, chunk))}`. **Interim text never written into the value** (only finalized chunks commit). Own module so the component file satisfies `react-refresh/only-export-components`.

- **Field-tailored opening question AND evaluator rubric.** Research agent classifies the candidate into one of 15 field/industry buckets (Tech/Product/Design, Data/AI/ML, Cybersecurity, Finance, Consulting, Legal, Government, Healthcare, Sales/Marketing, Ops/Supply Chain, Retail/Hospitality, Nonprofit, Education, Non-Software Engineering, Startups). Driven primarily by **job title**, secondarily by company (in-house counsel at a tech company → Legal). Category drives (1) opening-question prompt from `_field_prompts.py` and (2) evaluator rubric from `_field_rubrics.py`. Source-of-truth markdown: `backend/prompts/opening_question_prompts.md`, `evaluator_prompts.md` — keep Python and markdown in sync.

- **Experience-level tailoring (second axis).** On top of the 15 buckets, opening-question, evaluator, follow-up, AND company-research are tailored by `User.experience_level` (`ExperienceLevel`: internship / entry / mid / senior / staff / executive). The paragraph from the **15×6 matrix** comes from `experience_question_block(category, level)` / `experience_evaluator_block(category, level)` (intern → learning-in-ambiguity / coachability; executive → portfolio bets / enterprise leadership). Assembly:
  - **Opening question (`build_field_system_prompt(category, experience_level, rng)`):** with a level present the experience block **leads as `PRIMARY DRIVER`** and `FIELD_THEMES` are demoted to background ("do NOT contradict the experience-level focus above" — themes were out-competing the appended level note). Shared `style_cues` factored so the legacy `None` path stays byte-identical.
  - **Evaluator (`build_system_instruction(category, experience_level)`):** level paragraph **appended** as an extra section, keyed on the same resolved `key` the rubric fell back to.
  - **Empty-omission:** `experience_level is None` (legacy) → section/reorder dropped, byte-identical to category-only. Block helpers fail soft (non-`ExperienceLevel` → `""`).
  - **Source of truth:** markdown `backend/prompts/experience_prompts.md`; runtime `_experience_prompts.py` is **generated** via `python scripts/gen_experience_prompts.py` (don't hand-edit the `.py`). Import-time guard fails loud if any of the 90 cells is missing.
  - **Wiring:** threaded through `sessions.py` from `user.experience_level` into `research_company`, `_followup_and_tts` → `generate_followup`, and `evaluate_turn` / `_run_background_eval` (passed explicitly — the bg task has no request-scoped `user`).

- **Research-inspired, per-session-varied opening question.** Two structural fixes for "opening questions feel identical":
  - `_field_prompts.py` = shared intro + per-category `FIELD_THEMES` (5 labels, all shown) + per-category `FIELD_EXAMPLES` (5 questions, **2 randomly sampled per call** by `build_field_system_prompt(category, rng=None)`). The 2-of-5 rotation breaks the "fixed attractor" effect.
  - `company_research.py` fires **two parallel Serper queries** via `asyncio.gather`: `{company}` (description/headlines/values/category) and `{company} {level_label} {job_title} behavioral interview culture` (the generic "interview questions" phrasing was dropped — that corpus is LeetCode/system-design heavy and pulled `role_signals` toward technical proficiencies). `level_label` from `_EXPERIENCE_QUERY_LABEL` (e.g. `entry → "entry-level"`); `.get()` falls back to the level-agnostic string when `experience_level is None`. Summarizer prompt unchanged — level reaches Gemini implicitly via the echoed role query.
  - Brief adds `role_signals` (cultural/soft-skill traits) and `sample_question_themes` (behavioral theme labels, never verbatim questions). Both default `[]`. Gemini prompt has explicit MUST-NOTs: no technical proficiencies in `role_signals`, no technical themes in `sample_question_themes`, empty list correct for obscure companies.
  - **Empty-omission pattern (load-bearing).** `opening_question.py:_company_digest` surfaces these **only when non-empty**. Rendering "Role signals: (none)" cues the model to invent from priors — the failure mode the anti-hallucination rules prevent. Reused by `followup.py` and `SessionDetail.tsx` Overview.
  - **Recent-questions avoid-list (global, reset-on-profile-change).** `users.recent_opening_questions` (JSONB, `'[]'` server-default, migration `0008_recent_opening_qs`) caches the **3 most recent opening questions**, newest-first. `_recent_questions_block` injects them into the **user** prompt as a "generate a DISTINCT question — different scenario/theme/phrasing; do NOT rephrase, paraphrase, or echo" avoid-list (empty-omission; legacy path byte-identical). `sessions.py` reads it into `generate_opening_question(..., recent_questions=…)`, then rolls the new question back in (`([opening_q] + old)[:3]`, **reassigned not mutated** so SQLAlchemy dirty-tracking fires without `MutableList`). **Global scope** across companies. **Reset to `[]` in `onboarding.py`** whenever `target_role` / `industry` / `experience_level` changes (the single mutation point for the wizard AND Personalize). Deliberately **not** in `UserOut`.

- **Field-tailored, confusion-aware follow-up question.** `app/services/followup.py` (Gemini 2.5 Flash). Three coupled rules:
  - **Brief threading:** `generate_followup` accepts `category`, `role_signals`, `sample_question_themes`, `experience_level` (all default `None`, so legacy `brief_out is None` sessions still work). `_followup_and_tts` threads them from `brief_out` (+ `experience_level` from `user`). `Context:` block uses empty-omission. **No separate experience-tailored follow-up prompt** — `CompanyBrief` already bakes seniority into `role_signals` / `sample_question_themes`, so level is one calibration line ("Candidate's experience level: … — calibrate depth and scope"), not a matrix lookup.
  - **Confused-candidate rule:** off-topic / nonsensical / single-word answer → do NOT pretend it was substantive or echo it back; gently redirect by re-asking the original question more concretely.
  - **Output-format rule + narrow sanitizer:** prefatory **statements** about company/candidate are fine; meta-reasoning about the model's own thought process is forbidden. Output runs through `_sanitize_followup` (strips wrap-quotes, leading `Question:` / `Q:` / `Follow-up:` labels, asterisks). **A heuristic "drop preamble" trimmer was DELIBERATELY NOT added** (walking back from `?` false-positives on legitimate framings); meta-reasoning suppression lives in the prompt, not post-trim.

- **Two-turn interview session with auto-submit.** Locked: 1 opening + 1 follow-up. Practice has an **Auto-Submit** toggle (persisted, key `auto_submit_enabled`). On: "End recording" submits the moment MediaRecorder flushes (one-shot retry on transient LLM errors). Off: Submit / Re-record preview renders inside `CameraColumn` in the same 16:9 slot (no layout jump). Submit / Re-record lock with `disabled={submitting}` so double-click can't race.

- **Six scoring metrics per turn.** Five content scores (`structure`, `problem_solving`, `impact`, `initiative`, `depth`) + `delivery` (server-side from optional webcam analytics). Per-dimension **criteria** loaded dynamically from `_field_rubrics.py` by category (Healthcare `problem_solving` = patient-safety reasoning; Finance = quantitative trade-offs). `delivery` is `null` when camera declined. **All five base scores nullable on the wire** (`int | None = None`) — when eval never completes, `get_session` returns null, not 0; frontend renders "Evaluation Failed". Session averages and `turns_evaluated` exclude failed turns. **Do not re-introduce `int(t.structure_score or 0)` coercion** — it brings back the "0 0 0 0 0" failure-masking bug.

- **Balanced structured feedback per turn.** Feedback = `positive_moments`, `main_takeaway`, `improvement_moments`, `quick_wins`. Positive/improvement moments quote exact transcript snippets; positive explains what worked, improvement explains why a phrase weakened the answer + bite-sized suggestion. Legacy `coaching_moments` accepted as fallback.
  - **Char budgets stated TWICE** — prompt (snippet 120, keep_doing/main_takeaway 240, prose 330) AND Pydantic schema (~30 chars headroom: 270 / 270 / 390). `BeforeValidator` truncator clips overflow so one overlong field can't `ValidationError` the whole response. `transcript_snippet` truncates without ellipsis so the clip stays a substring (survives `_drop_unanchored_moments`). When changing a cap, change BOTH `evaluator_prompts.md` AND `evaluator.py`.
  - **Empty positives for non-answers:** unintelligible / off-topic / inappropriate → `positive_moments: []` (no invented praise), `improvement_moments` steered to `does_not_answer_question` / `off_track`, `main_takeaway` plainly states it didn't address the question. The "still include one positive" clause applies only to weak-but-genuine attempts.
  - **Distinct snippets across `improvement_moments`:** prompt forbids quoting the same sentence twice (combine into one moment with the most important `issue_type`); backend pairs that with `_dedupe_by_snippet` inside `_drop_unanchored_moments`. **Exact-string equality only** (substring/overlap dedup deliberately NOT added); first-occurrence wins, both lists.

- **Deterministic post-LLM score calibration.** `evaluator.py:_calibrate_content_scores` runs after the LLM and only ever **LOWERS** the five content scores to evidence-justified ceilings — never raises. Two layers:
  - **Word-count broad cap** on all five: `0` words → all `0`; `<10` → cap `2`; `<25` → cap `4`; `≥25` → no cap. (Old `25–44 → 6` tier removed.)
  - **Per-dimension evidence caps** gated by transcript regexes: no `_STRUCTURE_RE` (sequencing/STAR) → `structure ≤ 8`; no `_REASONING_RE` (causal/decision) → `problem_solving ≤ 8`; no `_RESULT_RE` AND no `_NUMBER_RE` → `impact ≤ 6` (result without number → `impact ≤ 8`); no `_OWNERSHIP_RE` (first-person) → `initiative ≤ 8`. **`depth` has NO evidence cap** — the old `_DOMAIN_DETAIL_RE` / `_ACRONYM_RE` regexes and `depth ≤ 5` cap were removed (tech-keyword-biased); depth steered by _soft_ prompt guidance only.
  - Caps are **soft ceilings mirrored in the prompt** so the model self-targets them. When you change a cap, change all three: `evaluator.py`, `evaluator_prompts.md`, and the calibration block in `_field_rubrics.py`.

- **Delivery score + structured delivery feedback (server-side, never LLM).** `evaluator.py:_compute_delivery_score(cv_summary)` derives the 0–10 `delivery` deterministically from MediaPipe webcam analytics: eye/posture calibrated bands + visual stability, minus coverage/streak penalties for severe sustained issues. Hard caps clamp looking away (`looked_away_pct`), low face visibility (`face_visible_pct`), bad posture/head-tilt. **Facial energy is deliberately one soft channel:** normalized `expression_quality` contributes once to the calibrated-quality blend; `low_energy_pct` / its streak are coaching diagnostics only (never deductions/caps) so a calm speaker isn't penalized. Browser `low_energy` requires all three flat signals (`expression < 32`, `smile < 20`, mouth openness `< .028`). `_build_delivery_feedback` emits `delivery_feedback` — `summary` naming the biggest visible issue + optional `eye_contact` / `alignment` / `posture` / `expression` cues (each ≤270 chars, deterministic); `_delivery_quick_win` adds one `"Delivery: …"` quick-win. Omitted when there's no `cv_summary`.

- **Browser-local face calibration.** Onboarding routes to optional `/calibrate?from=onboarding`; signed-in nav exposes `/calibrate`. Six-second capture reduces MediaPipe landmarks to bounded gaze / camera-angle / neutral-expression ratios in localStorage `face_delivery_calibration` (raw frames/landmarks discarded after capture). `useFaceAnalyzer` passes the saved profile into `FrameSummary`, which adjusts delivery aggregates before `cv_summary` is posted; no-calibration sessions use frozen fallback constants.

- **History + per-metric improvement tracking.** Every completed session persists turns / scores / aggregates to Postgres. History page lists sessions, replays audio, reads transcript, shows scores. `/me/stats` surfaces per-metric trends.

- **Interview voices (ElevenLabs).** Setup `VoicePicker` has multiple preset voices + "Surprise me" (aimed at non-native speakers). Per-session choice.

- **Free tier with daily session limits.** `pro` exists in `user_tier` but isn't exposed (flipping a row to `pro` skips the gate). Free = **5 completed sessions per local calendar day**. Counter increments at session **finalization** (in `submit_turn`'s final-turn branch), not creation — abandoning mid-session doesn't burn a slot but yields no feedback. Day reset uses IANA timezone from the browser (`users.timezone`, UTC fallback). Pre-check at `POST /sessions` runs **before** moderation / Serper / OpenRouter / TTS so rate-limited requests don't spend credits; returns 429. Race-safe via atomic single-`UPDATE` in `app/services/daily_limit.py`. Frontend reads `me.daily_session_count` for the "X/5 sessions today" indicator; 429 surfaces via FlashBanner.
  - **`GET /me` also runs `check_and_reset` for free-tier callers** so the counter never goes stale across a day boundary. Steady-state does **zero writes** — the UPDATE is gated by `User.count_reset_date.is_distinct_from(today)` (NULL-safe). Only the first `/me` of a new local day issues an UPDATE. Matters because `/me` hits on every route-guard pass via `useMe()`.

---

## Stack

- **Frontend**: React + Vite, Clerk (auth), recharts, MediaRecorder, MediaPipe (webcam delivery analytics)
- **Backend**: FastAPI, Alembic + Postgres, OpenAI Python SDK pointed at OpenRouter (`https://openrouter.ai/api/v1`)
- **APIs**: ElevenLabs (STT + TTS), OpenRouter (`deepseek/deepseek-v3.2` evaluator, `google/gemini-2.5-flash` research/opening/follow-up, `google/gemini-2.5-flash-lite` autocomplete + `openai/gpt-oss-120b` fallback), Serper
- **Auth**: Clerk JWT verified via `python-jose` against `CLERK_JWT_ISSUER` JWKS

---

## Architecture

```
Browser (React+Vite)
  │── Clerk JWT ──────────────────────► FastAPI
  │── MediaRecorder blob ─────────────► FastAPI
                                          │── ElevenLabs STT (audio → transcript)
                                          │── OpenRouter (DeepSeek v3.2 evaluator, Gemini 2.5 Flash research/questions)
                                          │── ElevenLabs TTS (text → audio)
                                          │── Serper API (company research)
                                          └── Postgres (via Alembic)
```

**Four straight-line LLM calls per session, all via OpenRouter.** #1/#2 fire once at session start; #3/#4 once per non-final turn (follow-up and evaluator in parallel — follow-up gates the user response, evaluator is a detached background task). See the matching MVP bullets above for full per-call detail.

1. **Company research + field classification** (`google/gemini-2.5-flash`). Two parallel Serper queries via `asyncio.gather` → `CompanyBrief(description, headlines, values, category, role_signals, sample_question_themes)`. `category` ∈ 15 buckets.
2. **Opening question** (`google/gemini-2.5-flash`). System by `build_field_system_prompt(brief.category, rng=None)`; user prompt (`_company_digest`) appends `role_signals` / `sample_question_themes` only when non-empty.
3. **Follow-up question** (non-final turns, `google/gemini-2.5-flash` via `followup.py`, system+user split). System = hard rules (10–25 words, references something concrete, ends in `?`) + confused-candidate + output-format rules; output through `_sanitize_followup`.
4. **Evaluate** (`deepseek/deepseek-v3.2`, JSON mode, detached background task). Rubric from `_field_rubrics.FIELD_RUBRICS` keyed on `brief.category` — same key as opening/follow-up, one consistent field identity per session.

---

## Data Model

```sql
users(id, clerk_user_id UNIQUE, email, name, resume_text, industry, target_role, experience_level, short_bio, completed_registration,
tier user_tier DEFAULT 'free', daily_session_count INT DEFAULT 0, count_reset_date DATE NULL, timezone TEXT NULL,
created_at, updated_at)

interview_sessions(id, user_id FK, config_id FK, status, company, job_title, company_summary, overall_score, notes, started_at, ended_at, created_at, updated_at)

interview_configs(id, user_id FK, company, job_title, job_description, company_context, interview_type, num_turns, ai_plan, created_at)

interview_turns(id, session_id FK, turn_number, question_text, transcript_text, is_followup, parent_turn_id FK,
structure_score INT, problem_solving_score INT, initiative_score INT, impact_score INT, depth_score INT,
delivery_score INT NULL, feedback TEXT NULL, feedback_detail JSONB NULL,
filler_word_count INT, filler_word_breakdown JSONB, cv_summary JSONB NULL, ai_model_used, evaluated_at, created_at)

session_metrics(id, session_id FK, avg_structure, avg_problem_solving, avg_initiative, avg_impact, avg_depth, avg_delivery, total_filler_word_count, overall_score, turns_evaluated, generated_at)
```

---

## API Routes

All routes except `/health` require Clerk JWT via a FastAPI dependency.

```
POST /onboarding              { resume_file, industry, target_role, short_bio }
POST /sessions                { company, job_title, voice_id?, timezone? } → 201 { session_id, summary, first_question, first_question_audio_url } | 429 (daily limit)
POST /sessions/{id}/turns     { audio_blob } → { transcript, scores, feedback, next_question, next_question_audio_url, is_final }
GET  /sessions/{id}           full session + turns
GET  /sessions                user's session history
GET  /me                      current user row (tier + daily_session_count)
GET  /me/stats                aggregate scores over time
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
        "issue_type": "too_vague | missing_detail | missing_result | missing_reasoning | off_track | unprofessional | does_not_answer_question | weak_wording | missed_opportunity | delivery",
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

- **Evaluator** → `deepseek/deepseek-v3.2` (migrated from Gemma 4 after Gemini rate-limiting + Google SDK deprecation). **Research / opening / follow-up** → `google/gemini-2.5-flash`. No other model mixing.
- **Scores:** five content dims LLM-scored 0–10 ints, then run through `_calibrate_content_scores` (only lowers); `delivery` computed server-side by `_compute_delivery_score` (never trusted from the model). All six nullable on the wire.
- **Delivery feedback:** `feedback_detail.delivery_feedback` built server-side from `cv_summary` (never the LLM), omitted when camera declined. `summary` required; the four cues optional, each ≤270 chars.
- **Feedback caps:** `positive_moments` ≤ 3, `improvement_moments` ≤ 4, `quick_wins` ≤ 3. Server-side: drop moments whose `transcript_snippet` isn't an exact substring, then `_dedupe_by_snippet` (exact equality, first-occurrence wins) on both lists.
- **Legacy:** `notes` still persisted in `interview_turns.feedback`. `feedback_detail.coaching_moments` normalized into `improvement_moments`.
- Pass full turn history in prompt so follow-ups reference earlier answers. Filler regex is ground truth; LLM breakdown supplemental only.

**Filler word regex** (case-insensitive, word boundaries): `um, uh, er, like, you know, basically, literally, actually, i mean, kind of, sort of, right`

---

## Session Rules

- **2 turns fixed**: 1 opening + 1 follow-up (hardcoded end condition). `is_final: true` on turn 2; `next_question` is empty string.

---

## Auth Implementation

`current_user(authorization: str = Header(...)) -> User` verifies the Bearer JWT against `CLERK_JWT_ISSUER` JWKS via `python-jose`, upserts the user by `clerk_user_id`, returns the DB row.

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
HEYGEN_API_KEY          # optional, only if avatar feature is attempted
```

---

## Frontend Routing

**React Router v7** (declarative `<BrowserRouter>` API, not the data router). `main.tsx` nests `<BrowserRouter>` inside `<ClerkProvider>`. Route table in `frontend/src/App.tsx`.

Routes (path → component → guards): `/` → `HomeRoute` (branches on auth inside); `/sign-in` → `SignIn` and `/sign-up` → `SignUp` (both `RedirectIfOnboarded`); `/onboarding` → `OnboardingForm` (`RequireAuth` + `RedirectIfOnboarded`); `/practice` → `Practice`, `/history` → `History`, `/sessions/:id` → `SessionDetail`, `/personalize` → `Personalize` (all `RequireAuth` + `RequireOnboarded`); `/calibrate` → `Calibration` (`RequireAuth`); `/sso-callback` → `SsoCallback` (none, Clerk OAuth completes here); `*` → `<Navigate to="/">`.

**Route guards** (three layout-route components in `route-guards.tsx`): each waits for Clerk `isLoaded` AND `useMe().isReady` (no wrong-page flash), renders `<Outlet />` on pass. `RequireAuth` — signed-out → `/sign-in`. `RequireOnboarded` — signed-in but `completed_registration === false` → `/onboarding`. `RedirectIfOnboarded` — signed-in AND onboarded → `/`. `HomeRoute` is the only auth-bivalent route: signed-out → `<Hero />`, signed-in → `<SignedInHome />` (half-onboarded → `/onboarding`, onboarded → `<Home />`).

**TopBar nav:** `TopBarNavLink` takes `to` + optional `matchPatterns?: string[]`, active via `matchPath` (Practice: `to="/" matchPatterns={['/practice']}`; History: `to="/history" matchPatterns={['/sessions/:id']}`).

**Setup → Practice handoff:** `navigate("/practice", { state: { sessionId, firstQuestion, firstQuestionAudioUrl } })`; `Practice` reads `useLocation().state` on mount, missing → `<Navigate to="/" replace />`. `PracticeLocationState` (exported from `Practice.tsx`) also carries `company` / `jobTitle`.

**Flash messages:** `FlashBanner.tsx` watches `location.state.flash` via a **`useEffect`** (not a `useState` initializer — lets same-route re-navigations re-trigger), then clears via `navigate(pathname, { replace: true, state: null })`, auto-dismiss 6s. Producers: `SessionDetail` redirects to `/` on 4xx (404/422/403), 5xx falls to inline error; `Home.tsx` 429 catch navigates to `/` with the free-tier message. Routing trade-off: gained deep-linking + normal refresh/back-forward, lost the cross-route morph sweep (in-component morph for Practice's Interview → Results preserved).

### Practice + SessionDetail

Full component internals live in `frontend/CLAUDE.md`. Cross-cutting facts to know here:

- **`Practice.tsx`** is one mount hiding a two-branch state machine — Interview (`!isDone && currentQ`, chrome-free full-viewport grid: `QuestionColumn` + `CameraColumn` + optional `TranscriptColumn` over a sticky `PracticeFooter`) and Results (`isDone`, folder-tab shell mirroring SessionDetail). Interview → Results uses a `useMorphTransition()` sweep; one component because both branches share `sessionId` / `turnResults` / `recorder` / `analyzer`. Camera box locked to `w-[45vw]` on desktop so it never resizes when the transcript toggles. Mid-session quit does NOT burn a daily slot. Final-turn POST refetches the session as `sessionDetail`; panels consume `effectiveTurns = sessionDetail?.turns ?? turnResults.map(replayToTurnDetail)` so the page renders even when the refetch fails.
- **`SessionDetail.tsx`** (`/sessions/:id`): folder-tab case file (Overview, Turn 1, Turn 2 — iterates `session.turns.length + 1`). Tab reset on `sessionId` change uses the **React-19 "compare prop to tracked state during render"** pattern, not a `useEffect` `setState`. Components under `frontend/src/components/session-detail/`; `_helpers.ts:SCORE_COLOR_MAP` mirrors `History.tsx:DIMENSIONS`. Issue-type chips render `formatIssueType(raw)` (generic snake_case → Title Case — don't hard-code a switch for the 10 types).

## Verification Checklist

- [ ] **Auth**: no/invalid JWT → 401, valid JWT → 200
- [ ] **Onboarding**: upload real PDF → `users.resume_text` non-empty and coherent
- [ ] **Evaluator contract**: canned transcript with 3 "um"s → `filler_word_count == 3`, all scores ints 0–10
- [ ] **E2E**: log in → onboard → start session ("Google") → complete turns aloud → summary shows non-zero scores → refresh → session appears
- [ ] **Failure mode**: kill ElevenLabs key mid-session → clear error, not blank screen
