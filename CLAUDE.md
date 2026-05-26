# Logos: AI Behavioral Interview Coach

MVP: Voice-in → transcript → LLM scoring + follow-up → ElevenLabs voice-out → metrics persisted.
Future plans: terms and conditions, security, add LiveAvatar, gamification with XP

## What the MVP ships

- **Personalization from a resume.** Onboarding ingests a PDF resume and a short bio, extracts `resume_text`, and stores target role + industry + experience level. Every downstream prompt (opening question, follow-up, evaluator) is conditioned on this profile so the session feels tailored, not generic.
- **Field-tailored opening question AND evaluator rubric.** The research agent classifies the candidate's interviewing context into one of 15 field/industry buckets (Tech/Product/Design, Data/AI/ML, Cybersecurity, Finance, Consulting, Legal, Government, Healthcare, Sales/Marketing, Ops/Supply Chain, Retail/Hospitality, Nonprofit, Education, Non-Software Engineering, Startups). The classification is driven primarily by the **job title** and secondarily by the company, so cross-functional roles (e.g. in-house counsel at a tech company → Legal) land in the right bucket. The category then drives **two** downstream choices: (1) the opening-question generator picks a category-specific system prompt from `app/services/_field_prompts.py` with field-appropriate tone and example shapes, and (2) the evaluator picks a category-specific rubric from `app/services/_field_rubrics.py` so the five content dimensions are scored against criteria that actually match the field (e.g. an Ops candidate's "Impact" is judged on throughput / cycle-time framing, not on a generic "what changed?" yardstick). Both prompt sets have markdown source-of-truth files in `backend/prompts/` (`opening_question_prompts.md` and `evaluator_prompts.md`) — keep the Python and markdown in sync.
- **Research-inspired, per-session-varied opening question.** Two structural fixes target a beta-tester complaint that opening questions felt nearly identical across companies in the same field and repeated across sessions for the same user. (1) `_field_prompts.py` is split into a shared intro template + per-category `FIELD_THEMES` (5 short theme labels shown in full each call) + per-category `FIELD_EXAMPLES` (5 example questions, of which **2 are randomly sampled per call** by `build_field_system_prompt(category, rng=None)`). The 2-of-5 rotation breaks the "fixed attractor" effect where the model converges on the same example shape regardless of input. (2) `company_research.py` fires **two parallel Serper queries** via `asyncio.gather` — the existing `{company}` query and a new behavioral-focused `{company} {job_title} behavioral interview culture` query (the generic "interview questions" phrasing was dropped because that corpus is dominated by LeetCode / system-design content and pulled `role_signals` toward technical proficiencies). The brief now carries two new fields: `role_signals` (cultural / soft-skill / values traits the company is documented to look for in this role) and `sample_question_themes` (theme labels — never verbatim questions — drawn from any behavioral interview leaks). Both default to `[]`, and the Gemini system prompt has explicit MUST-NOT rules: no technical proficiencies in `role_signals` (no "strong coding skills", "system design proficiency"); no technical question themes in `sample_question_themes` (no "system design challenges", "array manipulation"); empty list is the correct answer for small / obscure companies. `opening_question.py:_company_digest` surfaces both fields to the model — but **only when non-empty**; rendering "Role signals: (none)" would cue the model to fill the section in from its own priors, so empty sections are omitted entirely (load-bearing anti-hallucination behavior). `SessionDetail.tsx` surfaces the same two fields in the post-session "Company brief" card as `What they value: ...` and `Common themes: ...` bullets, joined by `', '`, conditionally rendered per-field.
- **Two-turn interview session with auto-submit.** Each session is a locked two-turn loop: one opening question + one follow-up that references the first answer. The practice page has an **Auto-Submit** toggle (persisted per user) — on, tapping "End answer" fires the turn submission the moment MediaRecorder flushes the last chunk; off, the user sees a preview block with Submit / Re-record. Auto-submit has a one-shot retry on transient LLM errors so a flaky model call doesn't strand the session.
- **Six scoring metrics per turn.** The evaluator returns five content scores — `structure`, `problem_solving`, `impact`, `initiative`, `depth` — plus `delivery`, a sixth score computed from optional webcam analytics (eye contact, expression, posture, energy). The five content dimensions have a single fixed JSON shape across all fields, but the **criteria each dimension is scored against** are loaded dynamically from `_field_rubrics.py` based on the session's classified category. Delivery is opt-in: if the user declines the camera, `delivery` is `null` and the other five still score. Filler words are counted by a hard-coded regex (ground truth), separate from the LLM. **All five base scores are nullable on the wire** (not just `delivery`): when a turn's evaluation never completes — background eval + inline fallback both raised — `get_session` returns null for that turn's scores rather than coercing to 0, and the frontend renders an explicit "Evaluation Failed" notice in the SessionDetail TurnCard and Practice ReplayCoachCard. The session-overall average and `turns_evaluated` aggregate exclude failed turns rather than averaging in phantom zeros.
- **Balanced structured feedback per turn.** The evaluator's scoring dimensions stay fixed, but the feedback layer is structured as `positive_moments`, `main_takeaway`, `improvement_moments`, and `quick_wins`. Positive and improvement moments must quote exact transcript snippets. Positive moments explain what worked and what to keep doing; improvement moments explain why a phrase weakened the answer and give a concrete, bite-sized suggestion, not a polished replacement answer. Legacy `coaching_moments` are still accepted as fallback for older saved turns. Every string field in `FeedbackDetail` has both a **prompt-side char budget** (told to DeepSeek per field — 120 for `transcript_snippet`, 240 for `keep_doing` / `main_takeaway`, 330 for the three prose fields) **and a Pydantic `max_length`** ~30 chars above each prompt cap (270 / 270 / 390 respectively). A `BeforeValidator` truncator clips anything past the schema cap so a single overlong field can no longer `ValidationError` the whole `EvaluatorOutput` — this is the load-bearing reason turn-1 scores stay populated even when DeepSeek occasionally over-quotes. `transcript_snippet` truncates without ellipsis so the clipped value remains a substring of the candidate transcript and survives `_drop_unanchored_moments`.
- **History + per-metric improvement tracking.** Every completed session persists turns, scores, and aggregates to Postgres. The History page lists sessions and lets the user open a session to replay the audio, read the transcript, and see each score. The Stats endpoint surfaces per-metric trends so improvement across runs is visible, not guessed at.
- **Interview voices (ElevenLabs) for non-native English speakers.** The Setup phase exposes a `VoicePicker` with multiple preset voices (different accents, tempos, and timbres) plus "Surprise me." This is aimed at non-native English speakers who want to practice hearing the kind of voice they'll face in a real screen — not just the one the app defaults to. Voice choice is per-session; switching between sessions is a single click.
- **Free tier with daily session limits.** Only the `free` tier is shipped today — `pro` exists in the `user_tier` Postgres enum but is not yet exposed in onboarding or billing; flipping a row to `pro` skips the gate entirely. Free users are capped at **5 completed sessions per local calendar day**. The counter increments at session **finalization** (in `submit_turn`'s final-turn branch), not at creation — abandoning mid-session doesn't burn a slot, but also doesn't yield feedback, which is the natural deterrent. Calendar-day reset uses the user's IANA timezone (sent from the browser on every session-create, stored on `users.timezone`), with UTC fallback for missing / unparseable values. The pre-check at `POST /sessions` runs BEFORE moderation / Serper / OpenRouter / TTS so a rate-limited request never spends API credits; it returns HTTP 429 with a user-facing detail string. The lazy-reset race (two requests crossing the day boundary) is handled in `app/services/daily_limit.py` with a single atomic `UPDATE` per call — no read-modify-write in Python. The frontend reads `me.daily_session_count` from `/me` to render a subtle "X/5 sessions today" indicator on `Home.tsx` and surfaces the 429 message via the FlashBanner. **`GET /me` also runs `check_and_reset` for free-tier callers** so the Home counter never goes stale across a day boundary — without this hook the reset only fired at `POST /sessions`, leaving Home showing "5/5" the morning after a capped evening even though the next session-create would correctly let the user through. The `check_and_reset` UPDATE is gated by `User.count_reset_date.is_distinct_from(today)` in the WHERE clause (NULL-safe — handles the first-ever call too), so the steady-state `/me` path does **zero writes**; only the first `/me` of a new local day actually issues an UPDATE. This matters because `/me` is hit on every route-guard pass via `useMe()` — multiplying read traffic by write traffic would be a scalability footgun. The atomic-UPDATE race-free guarantee is preserved because the day-rollover path still goes through Postgres row-locking.

Backed by a clean auth seam (Clerk JWT verified against the Clerk JWKS), the FastAPI backend, and a small set of sequential LLM calls routed through OpenRouter. No multi-agent loop — just three straight-line prompt calls per session.

---

## Stack

- **Frontend**: React + Vite, Clerk (auth), recharts (charts), MediaRecorder (audio capture), MediaPipe (webcam delivery analytics)
- **Backend**: FastAPI, Alembic + Postgres, OpenAI Python SDK pointed at OpenRouter (`https://openrouter.ai/api/v1`)
- **APIs**: ElevenLabs (STT + TTS), OpenRouter (routes to `deepseek/deepseek-v3.2` for the evaluator, `google/gemini-2.5-flash` for company research / opening question / follow-up), Serper (company research)
- **Auth**: Clerk JWT verified via `python-jose` against CLERK_JWT_ISSUER JWKS

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

**Three sequential LLM calls per session — not a multi-agent loop. All go through OpenRouter:**

1. Company research + field classification: **two parallel Serper queries** (via `asyncio.gather`) → `google/gemini-2.5-flash` summarization (once, session start). Query 1 is `{company}` (drives description / headlines / general values / category). Query 2 is `{company} {job_title} behavioral interview culture` — explicitly behavioral phrasing, NOT the generic "interview questions" corpus that's dominated by LeetCode / system-design content. Returns `CompanyBrief(description, headlines, values, category, role_signals, sample_question_themes)` where `category` is one of 15 field/industry buckets (classified primarily from `job_title`, secondarily from company), `role_signals` is a list of cultural / soft-skill traits the company looks for in this role (technical proficiencies are explicitly forbidden in the Gemini system prompt), and `sample_question_themes` is a list of behavioral theme labels — never verbatim questions. Both new fields default to `[]`; the prompt has explicit anti-hallucination rules requiring empty list for obscure companies / no-signal cases.
2. Opening question: `google/gemini-2.5-flash` (once, after research). The system prompt is assembled per request by `build_field_system_prompt(brief.category, rng=None)` in `app/services/_field_prompts.py`, which interpolates a shared intro template + the category's full 5-item `FIELD_THEMES` list + **2 randomly-sampled examples from the category's 5-item `FIELD_EXAMPLES` list**. The 2-of-5 example rotation is the load-bearing fix for cross-session opening-question repetition. The user prompt (`opening_question.py:_company_digest`) conditionally appends `role_signals` and `sample_question_themes` sections — **only when non-empty**; rendering "(none)" placeholders would cue the model to invent role framing from its own priors, which is exactly the failure mode the anti-hallucination rules in research are designed to prevent. Source-of-truth markdown lives in `backend/prompts/opening_question_prompts.md` — keep the two in sync.
3. Evaluate + next question: `deepseek/deepseek-v3.2` in JSON mode (once per turn, repeated). The rubric criteria injected into the evaluator's system prompt are selected from `app/services/_field_rubrics.FIELD_RUBRICS` keyed on `brief.category` (same key that picked the opening prompt — guarantees one consistent field identity per session). Source-of-truth markdown lives in `backend/prompts/evaluator_prompts.md`.

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
POST /sessions                { company, job_title, voice_id?, timezone? } → 201 { session_id, summary, first_question, first_question_audio_url } | 429 (free tier daily limit hit)
POST /sessions/{id}/turns     { audio_blob } → { transcript, scores, feedback, next_question, next_question_audio_url, is_final }
GET  /sessions/{id}           full session + turns (summary screen)
GET  /sessions                user's session history
GET  /me                      current user row (includes tier + daily_session_count for the Home counter)
GET  /me/stats                aggregate scores over time
```

`timezone` on `POST /sessions` is an IANA name (e.g. `America/New_York`) the browser sends via `Intl.DateTimeFormat().resolvedOptions().timeZone`. It's persisted on `users.timezone` and used by the free-tier daily-limit gate to compute "today" in the user's local calendar. Missing / unparseable values fall back to UTC.

TTS audio: return base64 inline in JSON — no S3.

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
    ]
  },
  "notes": "short backward-compatible summary for older clients"
}
```

- All LLM calls go through OpenRouter via the OpenAI Python SDK (`AsyncOpenAI(base_url="https://openrouter.ai/api/v1")`). JSON mode is `response_format={"type": "json_object"}` — NOT Gemini's `response_mime_type`.
- **Evaluator** → `deepseek/deepseek-v3.2` (migrated from Gemma 4 after persistent Gemini rate-limiting and the Google SDK deprecation). **Company research + opening question + follow-up** → `google/gemini-2.5-flash`. No other model mixing.
- **Six scores:** `structure`, `problem_solving`, `impact`, `initiative`, `depth` are LLM-scored 0–10 ints (clamped server-side). The field names are stable across all 15 fields, but the per-dimension criteria are loaded dynamically from `_field_rubrics.py` based on session category — so a Healthcare candidate's `problem_solving` is judged on patient-safety reasoning while a Finance candidate's is judged on quantitative trade-offs. `delivery` is a sixth score, computed server-side from optional webcam analytics (eye-contact, expression, posture, energy); it is `null` when the user declines the camera. The model is prompted to _consider_ delivery in the feedback text when analytics are present, but the numeric `delivery` score is always computed, never trusted from the model.
- **Feedback detail:** `positive_moments` is capped at 3, `improvement_moments` at 4, and `quick_wins` at 3. All moment snippets are dropped server-side unless the quoted `transcript_snippet` appears exactly in the candidate transcript. `how_to_strengthen` should be concrete and small, such as adding a customer concern, one reasoning sentence, or a small result. Do not generate a full polished answer.
- **Per-field char budgets are stated TWICE — in the prompt AND in the schema, with the schema giving ~30 chars of headroom.** Each capped string field is `Annotated[str, BeforeValidator(_truncate_to(limit, ellipsis=...))]` in `evaluator.py`. The truncator runs in `mode="before"` and clips anything past the schema cap so a single overlong field cannot `ValidationError` the entire response. `transcript_snippet` clips at 270 chars with no ellipsis (prefix-cut preserves the substring-in-transcript invariant that `_drop_unanchored_moments` checks); prose fields clip at 270 or 390 with `"..."`. The prompt-side budgets the model is told to target are: `transcript_snippet` 120, `keep_doing` / `main_takeaway` 240, `why_this_helped` / `why_this_weakened` / `how_to_strengthen` 330. If you tighten or loosen a cap, change it in BOTH places (the markdown source-of-truth in `backend/prompts/evaluator_prompts.md` and the Python `Field(max_length=...)` + `_truncate_to(...)` in `evaluator.py`) — the asymmetry is load-bearing for the resilience guarantee.
- **All five base scores are nullable on the wire.** `ScoresOut.structure` / `problem_solving` / `impact` / `initiative` / `depth` are `int | None = None` (matching `delivery`). `get_session` returns null — not 0 — when a turn's `_score` columns are NULL in the DB. This is what makes "Evaluation Failed" rendering possible in the UI; do not re-introduce `int(t.structure_score or 0)` coercion or you'll bring back the "0 0 0 0 0" failure-masking bug.
- **Legacy feedback:** `notes` is still persisted in `interview_turns.feedback` for older clients. `feedback_detail.coaching_moments` is accepted as a legacy alias and normalized into `improvement_moments`.
- Pass full turn history in prompt so follow-ups reference earlier answers.
- Filler regex is ground truth; any LLM breakdown is supplemental only.

**Filler word regex** (case-insensitive, word boundaries):
`um, uh, er, like, you know, basically, literally, actually, i mean, kind of, sort of, right`

---

## Session Rules

- **2 turns fixed**: 1 opening + 1 follow-up. Hardcode end condition — don't make it dynamic.
- `is_final: true` on turn 2 from Gemini. `next_question` is empty string.

---

## Auth Implementation (do this at T+0)

```python
async def current_user(authorization: str = Header(...)) -> User:
    # verify Bearer JWT against CLERK_JWT_ISSUER JWKS via python-jose
    # upsert user by clerk_user_id, return DB row
```

Verify this works before building anything else. A broken auth seam at hour 18 kills the demo.

---

## Env Vars

Document all of these in `.env.example` immediately:

```
DATABASE_URL
CLERK_SECRET_KEY
CLERK_JWT_ISSUER
OPENROUTER_API_KEY      # single key for all LLM calls (evaluator, research, questions)
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID     # default voice; per-session override selected in the VoicePicker
SERPER_API_KEY
HEYGEN_API_KEY          # optional, only if avatar feature is attempted
```

---

## Frontend Routing

The app uses **React Router v7** (`react-router@^7.14.2`, declarative `<BrowserRouter>` API — not the data router). `main.tsx` nests `<BrowserRouter>` inside `<ClerkProvider>` so route components can call `useAuth()` / `getToken()` freely. The whole route table lives in `frontend/src/App.tsx`.

### Route table

| Path            | Component           | Guards                                        |
| --------------- | ------------------- | --------------------------------------------- |
| `/`             | `HomeRoute`         | None at route level — branches on auth inside |
| `/sign-in`      | `SignIn`            | `RedirectIfOnboarded`                         |
| `/sign-up`      | `SignUp`            | `RedirectIfOnboarded`                         |
| `/onboarding`   | `OnboardingForm`    | `RequireAuth` + `RedirectIfOnboarded`         |
| `/practice`     | `Practice`          | `RequireAuth` + `RequireOnboarded`            |
| `/history`      | `History`           | `RequireAuth` + `RequireOnboarded`            |
| `/sessions/:id` | `SessionDetail`     | `RequireAuth` + `RequireOnboarded`            |
| `/personalize`  | `Personalize`       | `RequireAuth` + `RequireOnboarded`            |
| `/sso-callback` | `SsoCallback`       | None (Clerk OAuth completes here)             |
| `*`             | `<Navigate to="/">` | None                                          |

### Route guards

Three layout-route components in `frontend/src/components/route-guards.tsx`. Each waits for Clerk `isLoaded` AND `useMe().isReady` before deciding so we never flash the wrong page on initial load or session rehydration. Each renders `<Outlet />` on pass.

- **`RequireAuth`** — signed-out → `<Navigate to="/sign-in" replace />`.
- **`RequireOnboarded`** — assumes auth ran first; signed-in but `me.completed_registration === false` → `<Navigate to="/onboarding" replace />`.
- **`RedirectIfOnboarded`** — signed-in AND onboarded → `<Navigate to="/" replace />`. Used to bounce already-onboarded users away from `/sign-in`, `/sign-up`, and `/onboarding`. Half-onboarded users CAN visit `/sign-in`/`/sign-up` (signing in again as the same user is harmless).

### `/` is the only auth-bivalent route

`HomeRoute` (in `App.tsx`) is a thin shim that branches via Clerk `<Show>`:

- `signed-out` → `<Hero />`
- `signed-in` → `<SignedInHome />`, which checks `me.completed_registration`; `false` → `<Navigate to="/onboarding" replace />`, otherwise `<Home />`. Half-onboarded users can never reach Home.

### TopBar nav

`TopBarNavLink` (in `frontend/src/components/TopBar.tsx`) takes `to: string` plus optional `matchPatterns?: string[]`. It renders a `<Link>` and computes its active state via react-router's `matchPath` against the current location. Use `matchPatterns` for routes that should highlight a link without sharing its href:

- Practice link: `to="/" matchPatterns={['/practice']}` — active on both Setup and the running session.
- History link: `to="/history" matchPatterns={['/sessions/:id']}` — active on the list and on any session detail page.

### Setup → Practice handoff

`Home.tsx` (Setup) and `Practice.tsx` (Interview + Results) live at separate routes but the running session needs to carry the `sessionId` + first question across the boundary without a URL param. `Home.handleStart` POSTs `/api/v1/sessions`, then:

```ts
navigate("/practice", {
  state: { sessionId, firstQuestion, firstQuestionAudioUrl },
});
```

`Practice` reads `useLocation().state` on mount. If state is missing (refresh, direct URL, browser back into a stale `/practice`), it returns `<Navigate to="/" replace />` — silent redirect, matches today's "refresh loses session state" behavior. The `PracticeLocationState` type is exported from `Practice.tsx` so `Home.tsx` can import it for type safety on the navigate call.

### Flash messages

`frontend/src/components/FlashBanner.tsx` is a small one-shot notice that **watches** `location.state.flash` via a `useEffect` (not a `useState` initializer), captures it into local state, then clears the history entry's state via `navigate(pathname, { replace: true, state: null })` so refresh doesn't re-show it. Auto-dismisses after 6s, `×` button dismisses immediately. Mounted as a fixed overlay (`top-20 z-50`, `pointer-events-none` wrapper / `pointer-events-auto` inner) inside `Home.tsx` between TopBar and `<main>` so it floats above content without shifting layout. The effect (not initializer) pattern means **same-route re-navigations re-trigger the banner** — e.g. `Home.tsx` calling `navigate('/', { state: { flash } })` from its own 429 catch handler — instead of being swallowed because the component never unmounted.

Producers navigate with a flash like:

```ts
navigate("/", {
  replace: true,
  state: { flash: "The session you requested does not exist." },
});
```

`SessionDetail` is the first producer: when `useSessionDetail` returns an `errorStatus` in the 4xx range (404 / 422 / 403 — invalid id, gone, not yours), it redirects with the "session does not exist" flash. 5xx falls through to the inline error so transient backend issues stay visible. `Home.tsx` is the second producer — its 429 catch handler navigates to `/` with the free-tier limit message; the inline `setupError` block stays reserved for transient / retryable failures (mic denial, network blip, moderation reject).

### Trade-offs vs. the prior state-machine "routing"

- **Pro now:** deep-linking works; refresh + browser back/forward move between views as expected; new pages just register a `<Route>` instead of threading `onNavigate*` callbacks through every other page.
- **Lost UX:** the cross-route morph sweep (Hero ↔ SignIn ↔ SignUp; Setup → Practice) is gone. The in-component morph for Practice's Interview → Results is preserved (still the same component, still local state). `useMorphTransition` and `PageMorphTransition` are kept; re-adding cross-route morph would mean wrapping `useNavigate` calls with `trigger()`.

### `Practice.tsx` hides an internal state machine

`Practice.tsx` is mounted once at `/practice` but hides a nested state machine. Everything from "first question plays" through "review per-turn results" happens inside this one mount, gated by two render branches:

| Phase     | Gate                  | What renders                                    |
| --------- | --------------------- | ----------------------------------------------- |
| Interview | `!isDone && currentQ` | `<QuestionPlayer>` + recorder UI                |
| Results   | `isDone`              | Stepped Overview + per-turn `<ReplayCoachCard>` |

**Interview → Results uses `useMorphTransition()`** for a full-screen sweep at the moment `setIsDone(true)` fires. In-phase sub-state changes do NOT trigger the morph — they use the lighter `anim-crossfade` class, because a full-screen sweep for a sub-second UI flicker would be disruptive.

**Interview-phase sub-states** are driven by `useRecorder()`'s `recorder.state` (`'idle' | 'recording' | 'stopped'`) plus a few latches on top:

- `endingTurn` — latches true on "End answer" so the spinner shows immediately instead of flashing the preview UI for the ~tens-of-ms it takes MediaRecorder to flush its final chunk.
- `submittingTurn` — true while `/turns` is in flight.
- `retryingTurn` — the one-shot auto-retry gap for autoSubmit mode; keeps the spinner up between failure and retry so the preview block doesn't flash.
- `autoSubmit` (persisted via `useLocalStoragePref` under key `auto_submit_enabled`; the toggle lives in `Home.tsx`'s VoicePicker, Practice reads the same key) flips the whole flow: on → stop auto-submits; off → stop shows the Submit / Re-record preview.
- `replayKey` — bumped on Re-record so `<QuestionPlayer>` remounts, retriggering `<audio autoPlay>`; its existing `onEnded` handler then restarts the recorder. Reuses the same question without an imperative ref API.

**Auto-submit is wired through a ref-indirected effect.** `submitTurnRef` holds the latest `handleSubmitTurn` closure, refreshed every render by a no-deps effect. The auto-submit effect watches `[endingTurn, recorder.state, recorder.audioBlob, submittingTurn]` and calls `submitTurnRef.current()` the moment all four align. The ref keeps the closure fresh without the write-during-render anti-pattern the `react-hooks/refs` lint rule flags.

**Results phase has its own nested navigation.** `resultsStep` indexes into `0 = Overview, 1..N = per-turn ReplayCoachCard` (3 total with the locked 2-turn plan). `resultsStepKey` force-remounts the `<section>` on every step change so the slide animation replays; `resultsDirection` picks `anim-slide-in-left` (forward) vs `anim-slide-in-right` (back). Dots-as-tabs at the top and Back / "Review turn N+1" / "Start another session" buttons at the bottom drive `goToResultsStep(i)`. "Start another session" calls `navigate('/')` to return to Setup.

**Why Interview + Results stay in one component (instead of `/practice/interview` + `/practice/results`):** they share state (`sessionId`, `turnResults`, `recorder`, `analyzer`) and the Interview → Results transition is an animated sweep that shouldn't be interruptible by the browser back button. Splitting them would force a global store or heavy prop-drilling for zero user-visible benefit, since neither sub-phase has a meaningful URL of its own.

## Verification Checklist

- [ ] **Auth**: no JWT → 401, invalid JWT → 401, valid JWT → 200
- [ ] **Onboarding**: upload real PDF → `users.resume_text` is non-empty and coherent
- [ ] **Evaluator contract**: canned transcript with 3 "um"s → `filler_word_count == 3`, all scores are ints 0–10
- [ ] **E2E**: log in → onboard → start session (company: "Google") → complete 5 turns aloud → summary shows 5 rows with non-zero scores → refresh session list → session appears
- [ ] **Failure mode**: kill ElevenLabs API key mid-session → clear error shown, not blank screen
