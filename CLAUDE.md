# AI Behavioral Interview Coach

Hackathon MVP. Voice-in → transcript → LLM scoring + follow-up → ElevenLabs voice-out → metrics persisted.
Submit to: **Best Education** (primary), Best Overall (auto), as well as the **Gemini API**, **Elevenlabs** sponsor tracks.

## What the MVP ships

- **Personalization from a resume.** Onboarding ingests a PDF resume and a short bio, extracts `resume_text`, and stores target role + industry + experience level. Every downstream prompt (opening question, follow-up, evaluator) is conditioned on this profile so the session feels tailored, not generic.
- **Two-turn interview session with auto-submit.** Each session is a locked two-turn loop: one opening question + one follow-up that references the first answer. The practice page has an **Auto-Submit** toggle (persisted per user) — on, tapping "End answer" fires the turn submission the moment MediaRecorder flushes the last chunk; off, the user sees a preview block with Submit / Re-record. Auto-submit has a one-shot retry on transient LLM errors so a flaky model call doesn't strand the session.
- **Six scoring metrics per turn.** The evaluator returns five content scores — `directness`, `star`, `specificity`, `impact`, `conciseness` — plus `delivery`, a sixth score computed from optional webcam analytics (eye contact, expression, posture, energy). Delivery is opt-in: if the user declines the camera, `delivery` is `null` and the other five still score. Filler words are counted by a hard-coded regex (ground truth), separate from the LLM.
- **History + per-metric improvement tracking.** Every completed session persists turns, scores, and aggregates to Postgres. The History page lists sessions and lets the user open a session to replay the audio, read the transcript, and see each score. The Stats endpoint surfaces per-metric trends so improvement across runs is visible, not guessed at.
- **Interview voices (ElevenLabs) for non-native English speakers.** The Setup phase exposes a `VoicePicker` with multiple preset voices (different accents, tempos, and timbres) plus "Surprise me." This is aimed at non-native English speakers who want to practice hearing the kind of voice they'll face in a real screen — not just the one the app defaults to. Voice choice is per-session; switching between sessions is a single click.

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

1. Company research: Serper → `google/gemini-2.5-flash` summarization (once, session start)
2. Opening question: `google/gemini-2.5-flash` (once, after research)
3. Evaluate + next question: `deepseek/deepseek-v3.2` in JSON mode (once per turn, repeated)

---

## Data Model

```sql
users(id, clerk_user_id UNIQUE, email, name, resume_text, industry, target_role, experience_level,short_bio, completed_registration, created_at, updated_at)

interview_sessions(id, user_id FK, config_id FK, status, company, job_title, company_summary, overall_score, notes, started_at, ended_at, created_at, updated_at)

interview_configs(id, user_id FK, company, job_title, job_description, company_context, interview_type, num_turns, ai_plan, created_at)

interview_turns(id, session_id FK, turn_number, question_text, transcript_text, is_followup, parent_turn_id FK,
directness_score INT, star_score INT, specificity_score INT,
impact_score INT, conciseness_score INT,
filler_word_count INT, filler_word_breakdown JSONB, ai_model_used, evaluated_at, created_at)

session_metrics(id, session_id FK, avg_directness, avg_star, avg_specificity, avg_impact, avg_conciseness, total_filler_word_count, overall_score, turns_evaluated, generated_at)
```

---

## API Routes

All routes except `/health` require Clerk JWT via a FastAPI dependency.

```
POST /onboarding              { resume_file, industry, target_role, short_bio }
POST /sessions                { company } → { session_id, summary, first_question, first_question_audio_url }
POST /sessions/{id}/turns     { audio_blob } → { transcript, scores, feedback, next_question, next_question_audio_url, is_final }
GET  /sessions/{id}           full session + turns (summary screen)
GET  /sessions                user's session history
GET  /me/stats                aggregate scores over time
```

TTS audio: return base64 inline in JSON — no S3.

---

## Evaluator Schema (LOCKED — do not drift)

```json
{
  "scores": {
    "directness": 0,
    "star": 0,
    "specificity": 0,
    "impact": 0,
    "conciseness": 0,
    "delivery": 0
  },
  "feedback": "2-3 sentence coaching note",
  "filler_words": { "um": 0, "like": 0, "you know": 0 },
  "next_question": "string, empty if is_final",
  "is_final": false
}
```

- All LLM calls go through OpenRouter via the OpenAI Python SDK (`AsyncOpenAI(base_url="https://openrouter.ai/api/v1")`). JSON mode is `response_format={"type": "json_object"}` — NOT Gemini's `response_mime_type`.
- **Evaluator** → `deepseek/deepseek-v3.2` (migrated from Gemma 4 after persistent Gemini rate-limiting and the Google SDK deprecation). **Company research + opening question + follow-up** → `google/gemini-2.5-flash`. No other model mixing.
- **Six scores:** `directness`, `star`, `specificity`, `impact`, `conciseness` are LLM-scored 0–10 ints (clamped server-side). `delivery` is a sixth score, computed server-side from optional webcam analytics (eye-contact, expression, posture, energy); it is `null` when the user declines the camera. The model is prompted to _consider_ delivery in the feedback text when analytics are present, but the numeric `delivery` score is always computed, never trusted from the model.
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

There is no router library — no `react-router`, no `@tanstack/react-router`. The "routing" is a two-axis state machine inside `frontend/src/App.tsx`. Every page in `frontend/src/pages/` is reachable from a single URL (`localhost:5173/` in dev) by mutating React state. There is exactly one URL-driven branch.

**Axis 1 — auth (Clerk `<Show>`):**
`<Show when="signed-out">` mounts `SignedOutApp`; `<Show when="signed-in">` mounts `SignedInApp`. The `<ClerkProvider>` in `main.tsx` supplies the session.

**Axis 2 — view enum (`useState`):**

- `SignedOutApp`: `'hero' | 'signin' | 'signup'`. Swaps go through `useMorphTransition` for the sweep animation.
- `SignedInApp`: `'home' | 'history' | 'session' | 'personalize'`. The `'session'` view is paired with a separate `openSessionId` state so back-from-detail returns to the right place.

**Onboarding gate:** before the signed-in view enum is consulted, `App.tsx` checks `me.completed_registration`; when false it renders `<OnboardingForm />` instead. A half-onboarded user can never reach Home.

**The one URL-driven branch — `/sso-callback`:**
`App.tsx` checks `window.location.pathname === '/sso-callback'` first thing. If true, it renders `<SsoCallback />`, which wraps Clerk's `<AuthenticateWithRedirectCallback>`. Clerk finishes the OAuth handshake and redirects to `/`, after which the normal `<Show>` flow takes over.

**How pages navigate:** parent passes `onNavigate*` callbacks as props (no context, no global store). E.g. `<Home onNavigateHistory={() => setView('history')} />`. Each page's `TopBar` just calls them.

**Trade-offs:**

- Pro: small bundle, simple to reason about, no React-state-vs-URL drift.
- Con: no deep-linking; browser back/forward and refresh do not move between views; refresh always lands on the default view of the current auth branch.

**Adding a new top-level page:** extend the `SignedInView` (or `View`) union in `App.tsx`, add a branch that renders the page, and thread an `onNavigateX` callback into every existing page that needs to link to it (`Home`, `History`, `SessionDetail`, `Personalize`, plus their `TopBar` `nav` slots). There is no central route table.

### `Home.tsx` has its own internal state machine

`Home.tsx` (1658 lines) is mounted once by `App.tsx` but hides a second, nested state machine. Everything a user does during a practice session — pick a company, hear the question, record, review, score — happens inside this one mount, gated by three render branches in the final `return`:

| Phase     | Gate                               | What renders                                         |
| --------- | ---------------------------------- | ---------------------------------------------------- |
| Setup     | `!sessionId`                       | Hero "Which company are you interviewing with?" form |
| Interview | `sessionId && !isDone && currentQ` | `<QuestionPlayer>` + recorder UI                     |
| Results   | `isDone`                           | Stepped Overview + per-turn `<ReplayCoachCard>`      |

**Phase transitions use `useMorphTransition()`** — the same overlay used for signed-out page swaps. `morphDirection` is set before `trigger()` so the sweep runs in the right direction: Setup→Interview sweeps right-to-left (`'left'`, "stepping forward"); Interview→Results uses the default upward sweep (`'up'`). In-phase sub-state changes do NOT trigger the morph — they use the lighter `anim-crossfade` class, because a full-screen sweep for a sub-second UI flicker would be disruptive.

**Interview-phase sub-states** are driven by `useRecorder()`'s `recorder.state` (`'idle' | 'recording' | 'stopped'`) plus a few latches on top:

- `endingTurn` — latches true on "End answer" so the spinner shows immediately instead of flashing the preview UI for the ~tens-of-ms it takes MediaRecorder to flush its final chunk.
- `submittingTurn` — true while `/turns` is in flight.
- `retryingTurn` — the one-shot auto-retry gap for autoSubmit mode; keeps the spinner up between failure and retry so the preview block doesn't flash.
- `autoSubmit` (persisted via `useLocalStoragePref`) flips the whole flow: on → stop auto-submits; off → stop shows the Submit / Re-record preview.
- `replayKey` — bumped on Re-record so `<QuestionPlayer>` remounts, retriggering `<audio autoPlay>`; its existing `onEnded` handler then restarts the recorder. Reuses the same question without an imperative ref API.

**Auto-submit is wired through a ref-indirected effect.** `submitTurnRef` holds the latest `handleSubmitTurn` closure, refreshed every render by a no-deps effect. The auto-submit effect watches `[endingTurn, recorder.state, recorder.audioBlob, submittingTurn]` and calls `submitTurnRef.current()` the moment all four align. The ref keeps the closure fresh without the write-during-render anti-pattern the `react-hooks/refs` lint rule flags.

**Results phase has its own nested navigation.** `resultsStep` indexes into `0 = Overview, 1..N = per-turn ReplayCoachCard` (3 total with the locked 2-turn plan). `resultsStepKey` force-remounts the `<section>` on every step change so the slide animation replays; `resultsDirection` picks `anim-slide-in-left` (forward) vs `anim-slide-in-right` (back). Dots-as-tabs at the top and Back / "Review turn N+1" / "Start another session" buttons at the bottom drive `goToResultsStep(i)`.

**Why all three phases live in one component:** they share a lot of state (`sessionId`, `turnResults`, `recorder`, `analyzer`, `voiceId`, `me`) and the transitions are animated sweeps that shouldn't be interruptible by the browser back button. Splitting them across `/practice/setup`, `/practice/interview`, `/practice/results` would force either a global store or heavy prop-drilling through a router — for zero user-visible benefit, since none of these phases have URLs anyway. The cost is that `Home.tsx` is large; the payoff is session state never has to survive a navigation.

## Verification Checklist

- [ ] **Auth**: no JWT → 401, invalid JWT → 401, valid JWT → 200
- [ ] **Onboarding**: upload real PDF → `users.resume_text` is non-empty and coherent
- [ ] **Evaluator contract**: canned transcript with 3 "um"s → `filler_word_count == 3`, all scores are ints 0–10
- [ ] **E2E**: log in → onboard → start session (company: "Google") → complete 5 turns aloud → summary shows 5 rows with non-zero scores → refresh session list → session appears
- [ ] **Failure mode**: kill ElevenLabs API key mid-session → clear error shown, not blank screen
