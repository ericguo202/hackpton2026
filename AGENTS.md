# Logos: AI Behavioral Interview Coach

MVP: Voice-in → transcript → LLM scoring + follow-up → ElevenLabs voice-out → metrics persisted.
Future plans: terms and conditions, security, add LiveAvatar, gamification with XP

## What the MVP ships

- **Personalization from a resume.** Onboarding ingests a PDF resume + short bio, extracts `resume_text`, stores target role / industry / experience level. Every downstream prompt (opening question, follow-up, evaluator) is conditioned on this profile.
- **Industry & role autocomplete (required-selection combobox).** Onboarding + Personalize fill `industry` and `target_role` via an autocomplete dropdown backed by `/api/v1/validation/industries?q=` and `/api/v1/validation/roles?q=&industry=` (returns `SuggestionsOut { suggestions: str[≤5], flagged, message }`). This replaced the older classify-what-you-typed validation, which beta testers found slow (~10s on `gpt-oss-120b`) and hard to use when unsure of the field's name. `app/services/profile_validation.py:suggest_industries / suggest_roles` run a three-stage pipeline (moderation MUST precede the billed LLM): (1) cheap deterministic reject (`_looks_like_junk` — empty / prompt-injection / direct-request / gibberish / overlong) → empty list, no network; (2) OpenAI `check_moderation` → `flagged=True` + empty list on a hard-block; (3) LLM completion on `google/gemini-2.5-flash-lite` (primary, for speed) falling back to `openai/gpt-oss-120b`, JSON-only `{"suggestions":[...]}`, sanitized to ≤5 unique Title-Case strings. **Everything fails soft** — missing key / timeout / parse error returns an empty list so the field degrades gracefully. Suggestions are **semantic, not literal completions** (industry "computers" → Software / Cybersecurity / Information Technology; role "software" → Software Developer / Full-Stack Developer / Backend Engineer — they need not contain the typed text); the model is told to include a normalized version of the user's own input as an escape hatch for niche values. **Role suggestions are conditioned on the chosen industry** (empty industry → industry-agnostic). UI: shared `frontend/src/components/SuggestionCombobox.tsx` (ARIA listbox, 350ms debounce via `useDebouncedValue`, arrow-key + Enter or click to select) wrapped by `IndustryAutocompleteField` / `RoleAutocompleteField`. The field is a **required selection** — it's satisfied only once a suggestion is picked (`selected` boolean gate); free-typed text never advances, and editing re-arms the gate. Picking a suggestion in onboarding auto-advances the step. The validation `category` is no longer returned (it was always transient — the 15-bucket category is recomputed at session time by `company_research`). The gate is client-side only (`onboarding.py` stores the strings as-is).
- **Voice dictation for the bio field (browser-native, free — progressive enhancement).** The "Tell us about you" elevator-pitch `<textarea>` (Onboarding step 3 AND Personalize, the same `short_bio`) offers an optional mic for users who'd rather speak than type. Uses the **Web Speech API** (`window.SpeechRecognition ?? window.webkitSpeechRecognition`) — no API key, no backend round-trip, live interim results, needs only an HTTPS origin (Vercel/EC2/localhost all satisfy) + a one-time mic grant. It is deliberately **NOT** the ElevenLabs STT path — that's a record-blob-then-upload flow for the interview recorder, the wrong shape for an inline textbox. Three pieces:
  - `frontend/src/hooks/useSpeechRecognition.ts` — thin wrapper. Config `lang='en-US'`, `continuous=true`, `interimResults=true`. Returns `{ supported, listening, interim, error, start, stop, toggle }`. `onResult` fires once per **finalized** phrase; the latest interim guess is surfaced via `interim`. `onResult` is held in a **ref refreshed every render** so listeners use the freshest closure without re-binding. In `continuous` mode Chrome fires `onend` after a pause — a `wantListeningRef` gates an auto-restart so it keeps listening until the user explicitly stops. `not-allowed` / `service-not-allowed` set a gentle `error` and stop; `no-speech` / `aborted` are ignored. Local TS decls for the Web Speech surface (the DOM lib doesn't ship them reliably) — scoped to the file, no global `.d.ts`.
  - `frontend/src/components/SpeechToTextButton.tsx` — self-contained mic toggle reused by both forms (idle = `Mic` "Dictate", listening = pulsing `Square` "Stop", `aria-pressed`), the live greyed interim preview line, and the permission-error notice. **Renders `null` when `!supported`** (notably Firefox) so the textarea degrades to plain typing. It does NOT own the bio value.
  - `frontend/src/lib/joinSpoken.ts` — `joinSpoken(prev, chunk)` merges each finalized chunk into the controlled value (single separating space when needed, clamped to `MAX_BIO_LENGTH = 2000` to match the textarea `maxLength`). Both forms wire `onAppend={(chunk) => setShortBio((prev) => joinSpoken(prev, chunk))}`. **Interim text is never written into the textarea value** (avoids duplication) — only finalized chunks commit; interim lives only in the greyed preview. Kept in its own module so the component file exports only a component (satisfies `react-refresh/only-export-components`).
- **Field-tailored opening question AND evaluator rubric.** Research agent classifies the candidate into one of 15 field/industry buckets (Tech/Product/Design, Data/AI/ML, Cybersecurity, Finance, Consulting, Legal, Government, Healthcare, Sales/Marketing, Ops/Supply Chain, Retail/Hospitality, Nonprofit, Education, Non-Software Engineering, Startups). Classification is driven primarily by **job title**, secondarily by company (so in-house counsel at a tech company → Legal). The category drives (1) opening-question system prompt from `app/services/_field_prompts.py` and (2) evaluator rubric from `app/services/_field_rubrics.py`. Source-of-truth markdown lives in `backend/prompts/opening_question_prompts.md` and `evaluator_prompts.md` — keep Python and markdown in sync.
- **Research-inspired, per-session-varied opening question.** Two structural fixes for "opening questions feel identical across companies / sessions":
  - `_field_prompts.py` = shared intro + per-category `FIELD_THEMES` (5 labels, all shown) + per-category `FIELD_EXAMPLES` (5 questions, **2 randomly sampled per call** by `build_field_system_prompt(category, rng=None)`). The 2-of-5 rotation breaks the "fixed attractor" effect.
  - `company_research.py` fires **two parallel Serper queries** via `asyncio.gather`: `{company}` (drives description/headlines/values/category) and `{company} {job_title} behavioral interview culture` (the generic "interview questions" phrasing was dropped — that corpus is LeetCode/system-design heavy and pulled `role_signals` toward technical proficiencies).
  - The brief adds `role_signals` (cultural/soft-skill traits) and `sample_question_themes` (behavioral theme labels — never verbatim questions). Both default to `[]`. Gemini system prompt has explicit MUST-NOTs: no technical proficiencies in `role_signals`, no technical themes in `sample_question_themes`, empty list is correct for obscure companies.
  - **Empty-omission pattern (load-bearing).** `opening_question.py:_company_digest` surfaces these fields **only when non-empty**. Rendering "Role signals: (none)" cues the model to invent from its priors — exactly the failure mode the anti-hallucination rules prevent. Same pattern is reused by `followup.py` and `SessionDetail.tsx` Overview panel.
  - **Recent-questions avoid-list (global, reset-on-profile-change).** `users.recent_opening_questions` (JSONB, `'[]'` server-default — migration `0008_recent_opening_qs`) caches the candidate's **3 most recent opening questions**, newest-first. `opening_question.py:_recent_questions_block` injects them into the **user** prompt as an explicit "generate a DISTINCT question — different scenario/theme/phrasing; do NOT rephrase, paraphrase, or echo" avoid-list, using the same **empty-omission pattern** (omitted entirely when `[]`, so the legacy / first-session path stays byte-identical). `sessions.py` reads `user.recent_opening_questions` into `generate_opening_question(..., recent_questions=…)`, then rolls the new question back in (`([opening_q] + old)[:3]`, **reassigned not mutated** so SQLAlchemy dirty-tracking fires without `MutableList`) inside the same session + turn-1 commit. **Scope is global** across all companies — opening questions are role/experience-driven, not company-driven. The list is **reset to `[]` in `onboarding.py`** whenever `target_role` / `industry` / `experience_level` changes (the single mutation point backing both the onboarding wizard AND Personalize), since those fields define the shape of the questions. Internal prompt state — deliberately **not** in `UserOut`.
- **Field-tailored, confusion-aware follow-up question.** `app/services/followup.py` (Gemini 2.5 Flash). Three coupled rules:
  - **Brief threading:** `generate_followup` accepts `category`, `role_signals`, `sample_question_themes` (all default `None`, so legacy sessions with `brief_out is None` still work). `_followup_and_tts` in `sessions.py` threads them from `brief_out`. The `Context:` block in the user prompt uses the same empty-omission pattern as `_company_digest`.
  - **Confused-candidate rule:** if the answer is off-topic / nonsensical / single-word ("test test", "I am a very big drinker"), do NOT pretend it was substantive or echo the phrase back; gently redirect by re-asking the original question more concretely.
  - **Output-format rule + narrow sanitizer:** prefatory **statements** about company/candidate are fine ("Anthropic values AI safety. When you said…"); meta-reasoning about the model's own thought process is forbidden ("The user seems confused, let me redirect…"). Output runs through `_sanitize_followup` that strips wrap-quotes, leading `Question:` / `Q:` / `Follow-up:` labels, and asterisks. **A heuristic "drop preamble" trimmer was DELIBERATELY NOT added** — walking back from `?` to a sentence boundary false-positives on legitimate framings. Meta-reasoning suppression lives in the prompt, not post-trim (see `prompt_rule_vs_post_trim` memory).
- **Two-turn interview session with auto-submit.** Locked two-turn loop: 1 opening + 1 follow-up. Practice page has an **Auto-Submit** toggle (persisted per user, key `auto_submit_enabled`). On: "End recording" submits the moment MediaRecorder flushes. Off: Submit / Re-record preview renders inside `CameraColumn` in the same 16:9 slot (no layout jump). Auto-submit has one-shot retry on transient LLM errors. Submit / Re-record lock with `disabled={submitting}` so double-click can't race.
- **Six scoring metrics per turn.** Five content scores (`structure`, `problem_solving`, `impact`, `initiative`, `depth`) + `delivery` (computed server-side from optional webcam analytics — eye contact / expression / posture / energy). Per-dimension **criteria** are loaded dynamically from `_field_rubrics.py` by category (e.g. Healthcare `problem_solving` = patient-safety reasoning; Finance = quantitative trade-offs). `delivery` is `null` when camera declined. **All five base scores are nullable on the wire** (`int | None = None`) — when eval never completes, `get_session` returns null, not 0; frontend renders "Evaluation Failed" in SessionDetail TurnCard and Practice ReplayCoachCard. Session averages and `turns_evaluated` exclude failed turns. **Do not re-introduce `int(t.structure_score or 0)` coercion** — it brings back the "0 0 0 0 0" failure-masking bug.
- **Balanced structured feedback per turn.** Feedback layer = `positive_moments`, `main_takeaway`, `improvement_moments`, `quick_wins`. Positive/improvement moments quote exact transcript snippets; positive explains what worked, improvement explains why a phrase weakened the answer + bite-sized suggestion (not a polished replacement). Legacy `coaching_moments` accepted as fallback.
  - **Char budgets stated TWICE** — in the prompt (per-field target: snippet 120, keep_doing/main_takeaway 240, prose 330) AND in the Pydantic schema (~30 chars headroom: 270 / 270 / 390). `BeforeValidator` truncator clips overflow so one overlong field can't `ValidationError` the whole response — load-bearing for resilience (see `feedback_pydantic_prompt_mirror` memory). `transcript_snippet` truncates without ellipsis so the clip remains a substring of the transcript (survives `_drop_unanchored_moments`). When changing a cap, change BOTH `backend/prompts/evaluator_prompts.md` AND `evaluator.py`.
  - **Empty positives for non-answers:** unintelligible / off-topic / inappropriate answers get `positive_moments: []` (no invented praise), with `improvement_moments` steered to `does_not_answer_question` / `off_track` and `main_takeaway` plainly stating the response didn't address the question. The "still include one positive" clause applies only to weak-but-genuine attempts. Mirrors `followup.py`'s confused-candidate rule.
  - **Distinct snippets across `improvement_moments`:** prompt forbids quoting the same sentence twice (combine into one moment with the most important `issue_type`); backend pairs that with `_dedupe_by_snippet` in `evaluator.py` invoked inside `_drop_unanchored_moments`. **Exact-string equality only** — substring/overlap dedup is deliberately NOT added (false-positives on legitimate distinct quotes, per `prompt_rule_vs_post_trim`). First-occurrence wins; applied to both moment lists.
- **Deterministic post-LLM score calibration.** `evaluator.py:_calibrate_content_scores` runs after the LLM and only ever **LOWERS** the five content scores to evidence-justified ceilings — never raises — so "fluent but proves nothing" answers can't cluster at 5. Two layers:
  - **Word-count broad cap** on all five dims: `0` words → all five forced to `0`; `<10` → cap `2`; `<25` → cap `4`; `≥25` → no cap. (The old `25–44 → 6` tier was removed as too harsh.)
  - **Per-dimension evidence caps** gated by transcript regexes: no `_STRUCTURE_RE` (sequencing / STAR words) → `structure ≤ 8`; no `_REASONING_RE` (causal / decision words) → `problem_solving ≤ 8`; no `_RESULT_RE` AND no `_NUMBER_RE` → `impact ≤ 6` (a result without a number → `impact ≤ 8`); no `_OWNERSHIP_RE` (first-person ownership) → `initiative ≤ 8`. **`depth` has NO evidence cap** — the old `_DOMAIN_DETAIL_RE` / `_ACRONYM_RE` regexes and the `depth ≤ 5` cap were removed (tech-keyword-biased, unfair to the non-technical fields among the 15 buckets); depth is steered by *soft* prompt guidance only, never a rigid cutoff. The point of the raised `8`/`6` ceilings: don't penalize strong answers or make candidates sound robotic.
  - Caps are **soft ceilings mirrored in the prompt** so the model self-targets them. When you change a cap, change all three together: `evaluator.py`, `backend/prompts/evaluator_prompts.md`, and the calibration block in `_field_rubrics.py`.
- **Delivery score + structured delivery feedback (server-side, never LLM).** `evaluator.py:_compute_delivery_score(cv_summary)` derives the 0–10 `delivery` deterministically from MediaPipe webcam analytics: eye / posture calibrated bands + visual stability, minus coverage and streak penalties for severe sustained issues. Hard caps clamp looking away (`looked_away_pct`), low face visibility (`face_visible_pct`), and bad posture / head-tilt. **Facial energy is deliberately a single soft channel:** normalized `expression_quality` contributes once to the calibrated-quality blend. `low_energy_pct` / its streak are coaching diagnostics only — never score deductions or caps — so a calm, non-smiley speaker isn't penalized repeatedly. Browser `low_energy` classification also requires all three clearly-flat signals (`expression < 32`, `smile < 20`, mouth openness `< .028`) instead of the old effectively-smile-only rule. `_build_delivery_feedback` then emits the `delivery_feedback` object — a `summary` line naming the single biggest visible issue plus optional `eye_contact` / `alignment` / `posture` / `expression` cues (each ≤270 chars, all deterministic text). `_delivery_quick_win` adds one `"Delivery: …"` quick-win bullet. `delivery_feedback` is omitted when there's no `cv_summary` (camera declined).
- **Browser-local face calibration.** Onboarding continues to optional `/calibrate?from=onboarding`; signed-in navigation exposes `/calibrate` for later recalibration. The six-second capture reduces MediaPipe landmarks to bounded gaze / camera-angle / neutral-expression ratios stored under localStorage key `face_delivery_calibration`. Raw frames and landmark arrays are discarded after capture. `useFaceAnalyzer` passes the saved profile into `FrameSummary`, which adjusts the same delivery aggregates before `cv_summary` is posted; no-calibration sessions retain the frozen fallback constants.
- **History + per-metric improvement tracking.** Every completed session persists turns / scores / aggregates to Postgres. History page lists sessions and lets the user replay audio, read transcript, see scores. `/me/stats` surfaces per-metric trends.
- **Interview voices (ElevenLabs).** Setup `VoicePicker` has multiple preset voices (accents/tempos/timbres) + "Surprise me." Aimed at non-native English speakers who want to practice with varied voices. Per-session choice.
- **Free tier with daily session limits.** `pro` exists in the `user_tier` enum but isn't exposed (flipping a row to `pro` skips the gate). Free = **5 completed sessions per local calendar day**. Counter increments at session **finalization** (in `submit_turn`'s final-turn branch), not creation — abandoning mid-session doesn't burn a slot but also yields no feedback (the natural deterrent). Day reset uses IANA timezone from the browser (stored on `users.timezone`, UTC fallback). Pre-check at `POST /sessions` runs **before** moderation / Serper / OpenRouter / TTS so rate-limited requests don't spend API credits; returns HTTP 429. Race-safe via atomic single-`UPDATE` in `app/services/daily_limit.py`. Frontend reads `me.daily_session_count` for the "X/5 sessions today" indicator on Home; 429 surfaces via FlashBanner.
  - **`GET /me` also runs `check_and_reset` for free-tier callers** so the Home counter never goes stale across a day boundary. Steady-state path does **zero writes** — the UPDATE is gated by `User.count_reset_date.is_distinct_from(today)` (NULL-safe). Only the first `/me` of a new local day issues an UPDATE. Matters because `/me` hits on every route-guard pass via `useMe()`.

Backed by Clerk JWT (verified against Clerk JWKS), FastAPI, and four straight-line LLM calls per session (research + opening question once at start; follow-up + evaluator once per non-final turn, running in parallel — no multi-agent loop).

---

## Stack

- **Frontend**: React + Vite, Clerk (auth), recharts, MediaRecorder, MediaPipe (webcam delivery analytics)
- **Backend**: FastAPI, Alembic + Postgres, OpenAI Python SDK pointed at OpenRouter (`https://openrouter.ai/api/v1`)
- **APIs**: ElevenLabs (STT + TTS), OpenRouter (`deepseek/deepseek-v3.2` for evaluator, `google/gemini-2.5-flash` for research / opening / follow-up, `google/gemini-2.5-flash-lite` for industry/role autocomplete with `openai/gpt-oss-120b` fallback), Serper
- **Auth**: Clerk JWT verified via `python-jose` against `CLERK_JWT_ISSUER` JWKS

---

## Architecture

```
Browser (React+Vite)
  │── Clerk JWT ──────────────────────► FastAPI
  │── MediaRecorder blob ─────────────► FastAPI
                                          │── ElevenLabs STT (audio → transcript)
                                          │── OpenRouter (DeepSeek v3.2 evaluator, Gemini 2.5 Flash for research/questions)
                                          │── ElevenLabs TTS (text → audio)
                                          │── Serper API (company research)
                                          └── Postgres (via Alembic)
```

**Four straight-line LLM calls per session, all via OpenRouter.** #1 and #2 fire once at session start; #3 and #4 fire once per non-final turn (follow-up and evaluator run in parallel — follow-up gates the user response, evaluator is a detached background task).

1. **Company research + field classification.** Two parallel Serper queries via `asyncio.gather` → `google/gemini-2.5-flash`. Q1: `{company}`. Q2: `{company} {job_title} behavioral interview culture`. Returns `CompanyBrief(description, headlines, values, category, role_signals, sample_question_themes)`. `category` is one of 15 buckets; `role_signals` and `sample_question_themes` default to `[]` with explicit anti-hallucination MUST-NOTs in the system prompt.
2. **Opening question.** `google/gemini-2.5-flash`. System prompt assembled by `build_field_system_prompt(brief.category, rng=None)` (shared intro + full 5-item `FIELD_THEMES` + 2-of-5 sampled `FIELD_EXAMPLES`). User prompt (`opening_question.py:_company_digest`) appends `role_signals` and `sample_question_themes` **only when non-empty**.
3. **Follow-up question** (non-final turns). `google/gemini-2.5-flash` via `app/services/followup.py`, system+user split. System prompt = hard rules (10–25 words, references something concrete, ends in `?`) + confused-candidate rule + output-format rule. User prompt = question + transcript + optional `Context:` block carrying `Field:`, `role_signals`, `sample_question_themes` (same empty-omission pattern). Output runs through narrow `_sanitize_followup`.
4. **Evaluate.** `deepseek/deepseek-v3.2` in JSON mode (`response_format={"type": "json_object"}`). Detached background task. Rubric criteria selected from `app/services/_field_rubrics.FIELD_RUBRICS` keyed on `brief.category` — same key as opening / follow-up, guaranteeing one consistent field identity across opening / follow-up / scoring per session.

---

## Data Model

```sql
users(id, clerk_user_id UNIQUE, email, name, resume_text, industry, target_role, experience_level, short_bio, completed_registration,
tier user_tier DEFAULT 'free', daily_session_count INT DEFAULT 0, count_reset_date DATE NULL, timezone TEXT NULL,
created_at, updated_at)

interview_sessions(id, user_id FK, config_id FK, status, company, job_title, company_summary, overall_score, notes, started_at, ended_at, created_at, updated_at)

interview_configs(id, user_id FK, company, job_title, job_description, company_context, interview_type, num_turns, ai_plan, created_at)

interview_turns(id, session_id FK, turn_number, question_text, transcript_text, is_followup, parent_turn_id FK,
structure_score INT, problem_solving_score INT, initiative_score INT,
impact_score INT, depth_score INT,
delivery_score INT NULL, feedback TEXT NULL, feedback_detail JSONB NULL,
filler_word_count INT, filler_word_breakdown JSONB, cv_summary JSONB NULL, ai_model_used, evaluated_at, created_at)

session_metrics(id, session_id FK, avg_structure, avg_problem_solving, avg_initiative, avg_impact, avg_depth, avg_delivery, total_filler_word_count, overall_score, turns_evaluated, generated_at)
```

---

## API Routes

All routes except `/health` require Clerk JWT via a FastAPI dependency.

```
POST /onboarding              { resume_file, industry, target_role, short_bio }
POST /sessions                { company, job_title, voice_id?, timezone? } → 201 { session_id, summary, first_question, first_question_audio_url } | 429 (free tier daily limit)
POST /sessions/{id}/turns     { audio_blob } → { transcript, scores, feedback, next_question, next_question_audio_url, is_final }
GET  /sessions/{id}           full session + turns (summary screen)
GET  /sessions                user's session history
GET  /me                      current user row (includes tier + daily_session_count for the Home counter)
GET  /me/stats                aggregate scores over time
```

`timezone` on `POST /sessions` is an IANA name (e.g. `America/New_York`) from `Intl.DateTimeFormat().resolvedOptions().timeZone`. Persisted on `users.timezone`. Missing/unparseable → UTC.

TTS audio: base64 inline in JSON — no S3.

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
    "quick_wins": [
      "one keep-doing bullet",
      "one short practical fix"
    ],
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
- **Scores:** five content dims are LLM-scored 0–10 ints, then run through `_calibrate_content_scores` (deterministic ceilings — only lowers, never raises); `delivery` is computed server-side by `_compute_delivery_score` from webcam analytics (never trusted from the model). All six are nullable on the wire.
- **Delivery feedback:** `feedback_detail.delivery_feedback` is built server-side from `cv_summary` (never by the LLM) and omitted entirely when the camera was declined. `summary` is required; the four cue fields (`eye_contact` / `alignment` / `posture` / `expression`) are optional, each ≤270 chars.
- **Feedback caps:** `positive_moments` ≤ 3, `improvement_moments` ≤ 4, `quick_wins` ≤ 3. Server-side: drop moments whose `transcript_snippet` isn't an exact substring of the transcript, then `_dedupe_by_snippet` (exact equality, first-occurrence wins) on both lists.
- **Legacy feedback:** `notes` still persisted in `interview_turns.feedback`. `feedback_detail.coaching_moments` is normalized into `improvement_moments`.
- Pass full turn history in prompt so follow-ups reference earlier answers.
- Filler regex is ground truth; LLM breakdown is supplemental only.

**Filler word regex** (case-insensitive, word boundaries):
`um, uh, er, like, you know, basically, literally, actually, i mean, kind of, sort of, right`

---

## Session Rules

- **2 turns fixed**: 1 opening + 1 follow-up. Hardcode end condition.
- `is_final: true` on turn 2. `next_question` is empty string.

---

## Auth Implementation

```python
async def current_user(authorization: str = Header(...)) -> User:
    # verify Bearer JWT against CLERK_JWT_ISSUER JWKS via python-jose
    # upsert user by clerk_user_id, return DB row
```

---

## Env Vars

```
DATABASE_URL
CLERK_SECRET_KEY
CLERK_JWT_ISSUER
OPENROUTER_API_KEY      # single key for all LLM calls (evaluator, research, questions)
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID     # default voice; per-session override via VoicePicker
SERPER_API_KEY
HEYGEN_API_KEY          # optional, only if avatar feature is attempted
```

---

## Frontend Routing

**React Router v7** (`react-router@^7.14.2`, declarative `<BrowserRouter>` API — not the data router). `main.tsx` nests `<BrowserRouter>` inside `<ClerkProvider>`. Route table in `frontend/src/App.tsx`.

### Route table

| Path            | Component           | Guards                                        |
| --------------- | ------------------- | --------------------------------------------- |
| `/`             | `HomeRoute`         | None — branches on auth inside                |
| `/sign-in`      | `SignIn`            | `RedirectIfOnboarded`                         |
| `/sign-up`      | `SignUp`            | `RedirectIfOnboarded`                         |
| `/onboarding`   | `OnboardingForm`    | `RequireAuth` + `RedirectIfOnboarded`         |
| `/practice`     | `Practice`          | `RequireAuth` + `RequireOnboarded`            |
| `/history`      | `History`           | `RequireAuth` + `RequireOnboarded`            |
| `/sessions/:id` | `SessionDetail`     | `RequireAuth` + `RequireOnboarded`            |
| `/personalize`  | `Personalize`       | `RequireAuth` + `RequireOnboarded`            |
| `/calibrate`    | `Calibration`       | `RequireAuth`                                 |
| `/sso-callback` | `SsoCallback`       | None (Clerk OAuth completes here)             |
| `*`             | `<Navigate to="/">` | None                                          |

### Route guards

Three layout-route components in `frontend/src/components/route-guards.tsx`. Each waits for Clerk `isLoaded` AND `useMe().isReady` before deciding (no wrong-page flash). Each renders `<Outlet />` on pass.

- `RequireAuth` — signed-out → `/sign-in`.
- `RequireOnboarded` — signed-in but `me.completed_registration === false` → `/onboarding`.
- `RedirectIfOnboarded` — signed-in AND onboarded → `/`. Half-onboarded users can still visit `/sign-in`/`/sign-up`.

`HomeRoute` is the only auth-bivalent route: signed-out → `<Hero />`, signed-in → `<SignedInHome />` which routes half-onboarded users to `/onboarding` and onboarded users to `<Home />`.

### TopBar nav

`TopBarNavLink` (`frontend/src/components/TopBar.tsx`) takes `to: string` + optional `matchPatterns?: string[]`; active state computed via `matchPath`.

- Practice link: `to="/" matchPatterns={['/practice']}` — active on Setup and running session.
- History link: `to="/history" matchPatterns={['/sessions/:id']}` — active on list and any session detail.

### Setup → Practice handoff

Cross-route state via `navigate("/practice", { state: { sessionId, firstQuestion, firstQuestionAudioUrl } })`. `Practice` reads `useLocation().state` on mount; missing state → `<Navigate to="/" replace />` (refresh loses session, matches today's behavior). The `PracticeLocationState` type is exported from `Practice.tsx`.

### Flash messages

`FlashBanner.tsx` watches `location.state.flash` via a **`useEffect`** (not a `useState` initializer), captures into local state, then clears the history entry via `navigate(pathname, { replace: true, state: null })` so refresh doesn't re-show. Auto-dismiss 6s. Fixed overlay (`top-20 z-50`, `pointer-events-none` wrapper / `pointer-events-auto` inner). The effect (not initializer) pattern lets same-route re-navigations re-trigger the banner (e.g. Home's 429 catch handler).

Producers: `SessionDetail` redirects to `/` with a flash on 4xx errors (404/422/403); 5xx falls through to inline error. `Home.tsx` 429 catch handler navigates to `/` with the free-tier message.

### Trade-offs vs. prior state-machine "routing"

- **Pro:** deep-linking works; refresh + back/forward behave normally; new pages just register a `<Route>`.
- **Lost:** cross-route morph sweep (Hero ↔ SignIn ↔ SignUp; Setup → Practice). In-component morph for Practice's Interview → Results is preserved. `useMorphTransition` and `PageMorphTransition` are kept.

### `Practice.tsx` hides an internal state machine

One mount at `/practice`, two render branches:

| Phase     | Gate                  | What renders                                                                                                                                                                          |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interview | `!isDone && currentQ` | Full-viewport `flex h-screen flex-col`: body grid (`<QuestionColumn>` + `<CameraColumn>` + optional `<TranscriptColumn>`) over sticky `<PracticeFooter>` + `<QuitConfirmDialog>` |
| Results   | `isDone`              | Folder-tab case-file shell mirroring SessionDetail — `<FolderTabs>` + `<SideNavButton>` chevrons over `<PracticeOverviewPanel>` / `<PracticeTurnPanel>` |

- **TopBar is phase-gated** (`{isDone && …}`) — Interview phase is chrome-free; the sticky footer carries every session-level control. Results renders TopBar but drops the legacy ScoreDimensions feature rail and the bottom CTA row.
- **Layout** (`min-[900px]:grid` desktop / `flex flex-col` mobile). Desktop grid flips between `[33%_67%]` (transcript closed) and `[25%_50%_25%]` (open). Camera box is locked to **`w-[45vw]` on desktop** regardless of template — grid columns flex around it so the preview never resizes when transcript toggles. Mobile stacks question → camera → transcript. `min-[900px]:justify-center` on columns (desktop centers, mobile hugs top).
- **Interview → Results** uses `useMorphTransition()` full-screen sweep on `setIsDone(true)`. Sub-state changes use lighter `anim-crossfade`.
- **Interview sub-states** driven by `useRecorder()`'s `recorder.state` plus latches: `endingTurn` (footer tap → immediate spinner), `submittingTurn` (disables preview buttons during POST), `retryingTurn` (one-shot autoSubmit retry gap), `autoSubmit` (persisted under `auto_submit_enabled`; toggle in Home's VoicePicker, read in Practice), `replayKey` (bumped on Re-record / Restart-turn to remount the `<audio>` so `autoPlay` re-fires), `showTranscript` (disabled on turn 1, has its own X close), `showQuitConfirm` (`<QuitConfirmDialog>`; quit calls `handleQuit` that stops recorder + `navigate('/')`; mid-session quit does NOT burn a daily slot).
- **Auto-submit wiring:** `submitTurnRef` holds the latest `handleSubmitTurn` closure (refreshed every render via no-deps effect). Auto-submit effect watches `[endingTurn, recorder.state, recorder.audioBlob, submittingTurn]` and calls `submitTurnRef.current()` when all four align. Ref keeps closure fresh without the write-during-render anti-pattern the `react-hooks/refs` lint rule flags.
- **Results nested nav:** `activeTabIndex` (0 = Overview, 1..N = per-turn) — single source of truth. `FolderTabs` strip + circular `SideNavButton` chevrons on desktop (`sticky top-[50vh] -translate-y-1/2` + `items-start` on the gutter columns, same load-bearing pattern as SessionDetail). Mobile drops the chevrons and tabs strip, surfaces a "Overview · 1 of N" indicator + a Prev/Next FlowHoverButton row, plus horizontal-swipe handlers on the `<section>`. `useMorphTransition` still drives the Interview → Results sweep; tab changes within Results use `anim-crossfade` keyed on `activeTabIndex`.
- **Results data flow:** Final-turn POST refetches the full session and stores it as `sessionDetail`. The Overview / Turn panels consume `effectiveTurns = sessionDetail?.turns ?? turnResults.map(replayToTurnDetail)` so the page renders even when the refetch fails — synthetic `TurnDetail`s carry the same local transcript and feedback, just no canonical server averages. The Practice-only Video and Improve-next cards still consume the local `ReplayTurnResult` (`replayUrl`, `audioReplayUrl`, `cvSummary`, `analyzerDiagnostics`) via the `replayFor()` extractor.
- **Why one component:** Interview + Results share state (`sessionId`, `turnResults`, `recorder`, `analyzer`); the transition is an animated sweep that shouldn't be interruptible by browser back. Splitting would force a global store for zero user-visible benefit.

### `SessionDetail.tsx` is a folder-tab case file

`/sessions/:id` is a single dark-beige outer card with folder-shaped tabs on top — Overview, Turn 1, Turn 2 (orchestrator iterates `session.turns.length + 1`). TopBar's History link covers the back affordance; per-session metadata lives in the Overview panel.

State is just `activeTabIndex`. Reset on `sessionId` change uses the **React-19 "compare prop to tracked state during render"** pattern (`useState` + render-time comparison), not a `useEffect`-driven `setState` — the linter rejects the latter under `react-hooks/set-state-in-effect`.

**Component composition** (all under `frontend/src/components/session-detail/`):

- **`FolderTabs.tsx`** — tabs strip + circular side-nav buttons (exports `SideNavButton`). Tabs are `<button>`s with `rounded-t-lg`, `border-b-0`, `-mb-px` overlap onto card so there's no seam. Active = `bg-accent text-accent-fg`; inactive = `bg-tertiary-200 text-text-muted` (same fill as card body). Standard ARIA tabs with `←`/`→`/`Home`/`End` keyboard nav.
- **`OverviewPanel.tsx`** — "case file" identity left, per-dimension averages right. 1-col below 900px, 2-col above. Six `ScoreTile`s in `grid-cols-2 min-[900px]:grid-cols-3`. Conditionally renders `summary.description`, `headlines`, `role_signals`, `sample_question_themes` — empty-array sections omitted entirely.
- **`TurnPanel.tsx`** — four inner cards as two independent 2-column row grids (Q+A | Scores+Takeaway+QuickWins, then What Worked | Improvement Moments). Single-column stack <900px. A single `grid-rows-2 auto-rows-fr` was tried and rejected: forced both rows to match the taller one, leaving huge gutters under the short row. Two independent row grids let each row size to its own content while equalizing within a row via `items-stretch` + `InnerCard`'s `h-full`.
- **`_helpers.ts`** — `SCORE_KEYS`, `SCORE_COLOR_MAP`, `num()`, `turnAverage()`. Color map is the single source of truth for per-dimension chart hues; mirrors `History.tsx:DIMENSIONS` (structure → chart-1 teal, problem_solving → chart-2 terracotta, impact → chart-3 forest, initiative → chart-4 plum, depth → chart-5 amber, delivery → chart-6 indigo).

**Mobile (<900px):** folder tabs and side buttons hide (`hidden min-[900px]:flex`). Small "Overview · 1 of 3" indicator replaces the tab strip. Nav comes from horizontal swipe (`touchstart`/`touchend` thresholded `|dx| > 60 && |dx| > 1.5·|dy|` so vertical scrolls don't accidentally page) + Previous/Next `FlowHoverButton` row (Prev = `variant="dark"`, Next = `variant="light"`, absent direction → invisible `flex-1` spacer).

**Issue-type chips** render `formatIssueType(raw)` — generic snake_case → Title Case. Don't hard-code a switch for the 10 canonical types; generic formatter handles unknowns gracefully.

## Verification Checklist

- [ ] **Auth**: no JWT → 401, invalid JWT → 401, valid JWT → 200
- [ ] **Onboarding**: upload real PDF → `users.resume_text` is non-empty and coherent
- [ ] **Evaluator contract**: canned transcript with 3 "um"s → `filler_word_count == 3`, all scores are ints 0–10
- [ ] **E2E**: log in → onboard → start session (company: "Google") → complete 5 turns aloud → summary shows 5 rows with non-zero scores → refresh session list → session appears
- [ ] **Failure mode**: kill ElevenLabs API key mid-session → clear error shown, not blank screen
