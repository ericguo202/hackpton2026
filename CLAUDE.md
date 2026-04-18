# AI Behavioral Interview Coach

Hackathon MVP. Voice-in → transcript → Gemini scoring + follow-up → ElevenLabs voice-out → metrics persisted.
Submit to: **Best Education** (primary), Best Overall (auto), as well as the **Gemini API**, **Elevenlabs** sponsor tracks.

THIS IS CURRENTLY JUST AN OVERVIEW OF THE PLAN.

---

## Stack

- **Frontend**: React + Vite, Clerk (auth), recharts (charts), MediaRecorder (audio capture)
- **Backend**: FastAPI, Alembic + Postgres, `google.generativeai` (direct — no agent SDK)
- **APIs**: ElevenLabs (STT + TTS), Gemini 2.5 Flash (all LLM calls), Serper (company research)
- **Auth**: Clerk JWT verified via `python-jose` against CLERK_JWT_ISSUER JWKS

---

## Architecture

```
Browser (React+Vite)
  │── Clerk JWT ──────────────────────► FastAPI
  │── MediaRecorder blob ─────────────► FastAPI
                                          │── ElevenLabs STT (audio → transcript)
                                          │── Gemini 2.5 Flash (structured JSON)
                                          │── ElevenLabs TTS (text → audio)
                                          │── Serper API (company research)
                                          └── Postgres (via Alembic)
```

**Three sequential Gemini calls per session — not a multi-agent loop:**

1. Company research: Serper → Gemini summarization (once, session start)
2. Opening question: Gemini (once, after research)
3. Evaluate + next question: Gemini structured JSON (once per turn, repeated)

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

## Gemini Evaluator Schema (LOCKED — do not drift)

```json
{
  "scores": {
    "directness": 0,
    "star": 0,
    "specificity": 0,
    "impact": 0,
    "conciseness": 0
  },
  "feedback": "2-3 sentence coaching note",
  "filler_words": { "um": 0, "like": 0, "you know": 0 },
  "next_question": "string, empty if is_final",
  "is_final": false
}
```

- Use `response_mime_type="application/json"` + response schema on all Gemini calls
- Use Gemini 2.5 Flash for **everything** — don't mix models
- Pass full turn history in prompt so follow-ups reference earlier answers
- Filler regex is ground truth; Gemini breakdown is supplemental only

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
GEMINI_API_KEY
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
SERPER_API_KEY
HEYGEN_API_KEY   # optional, only if avatar feature is attempted
```

---

## Build Order

| Hours | Task                                                                                  | Done when                                                 |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0–2   | Vite+React scaffold, FastAPI, Docker Postgres, Clerk JWT on a protected route         | `/me` returns clerk_user_id for signed-in user            |
| 2–4   | Alembic migrations, onboarding endpoint, PDF resume parse (`pdfplumber`)              | User profile round-trips through DB                       |
| 4–6   | Gemini evaluator + locked JSON schema + filler regex; unit test with typed transcript | `/turns` returns valid scores given text input (no audio) |
| 6–8   | Company research (Serper → Gemini) + opening question generation                      | `/sessions` returns summary + Q1                          |
| 8–10  | ElevenLabs TTS: base64 audio in JSON response, frontend `<audio>` playback            | Q1 plays in browser                                       |
| 10–12 | MediaRecorder → blob POST → ElevenLabs STT → transcript → `/turns`                    | One full turn works end-to-end in browser                 |
| 12–15 | Full 2-turn loop, session summary screen, all scores persisted                        | Complete mock interview start-to-finish                   |
| 15–17 | Onboarding UI, session history list, per-metric line chart (recharts)                 | Second session shows trend vs first                       |
| 17–19 | UI polish: loading states, error toasts, mic-permission handling                      | App doesn't look like a hackathon project                 |
| 19–21 | HeyGen LiveAvatar — **only if all above is green**                                    | Optional; skip without guilt                              |
| 21–23 | Seed demo user + scripted session                                                     | Rehearsed demo runs twice clean                           |
| 23–24 | Record video, submit                                                                  | Done                                                      |

---

## Cut List (in order — never cut the core loop)

1. HeyGen avatar
2. Historical charts → raw score table
3. Company research → hardcoded generic question bank
4. Session history → ephemeral single-session demo

**Core loop is non-negotiable**: voice in → transcript → Gemini JSON + follow-up → TTS out → row in `turns`

---

## Verification Checklist

- [ ] **Auth**: no JWT → 401, invalid JWT → 401, valid JWT → 200
- [ ] **Onboarding**: upload real PDF → `users.resume_text` is non-empty and coherent
- [ ] **Evaluator contract**: canned transcript with 3 "um"s → `filler_word_count == 3`, all scores are ints 0–10
- [ ] **E2E**: log in → onboard → start session (company: "Google") → complete 5 turns aloud → summary shows 5 rows with non-zero scores → refresh session list → session appears
- [ ] **Failure mode**: kill ElevenLabs API key mid-session → clear error shown, not blank screen

---

## STT Fallback

If ElevenLabs STT fails at T+11: swap to Gemini audio input. Same FastAPI endpoint shape, different upstream call. No frontend changes needed.
