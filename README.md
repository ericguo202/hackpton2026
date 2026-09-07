# InterviewPie

> _Guided interview practice rooted in questions, speech, and reason_

[InterviewPie](https://interviewpie.com)

An AI-powered behavioral interview coach. Speak your answer, get a tailored
follow-up question and rubric-based scoring in the same flow you'd get from a
real interviewer — including how you came across on camera.

Now in beta with college undergraduates, new grads, and recruiters / hiring
managers helping calibrate the coaching against the bar real interviewers set.

---

## Inspiration

Behavioral interviews decide who gets the offer, but they're the part of the
loop candidates rehearse the least and lose offers on the most. Friends can't
simulate a stranger pushing back with a sharp follow-up, mock-interview
platforms skew technical, and recording yourself gives you a tape without
coaching — you hear the rambling but not which part is hurting you.

InterviewPie closes that gap: speak your answer to a real interviewer voice, get a
follow-up question that references what you actually said, and receive
six-dimension scoring grounded in your industry plus a delivery grade pulled
from your webcam. It's built for college undergraduates preparing for their
first internship loops, new grads navigating full-time hiring, and the
recruiters and managers who care that what candidates are practicing actually
maps to what gets people hired.

---

## Features

### Industry-specific questions and rubric — not a generic checklist

InterviewPie classifies every session into one of **15 field/industry buckets**
(Tech, Finance, Healthcare, Legal, Consulting, Sales, Ops, Nonprofit,
Education, Government, and more) using both the company and target job title,
so cross-functional roles land in the right place — a healthcare counsel role
is graded as Legal, not as Healthcare. That classification drives _two_
downstream choices: the opening question is written by a system prompt
tailored to the field's actual interview shape, and the evaluator is handed
a rubric whose criteria match that field. A finance candidate's
"Problem Solving" is judged on quantitative trade-offs; a healthcare
candidate's is judged on patient-safety reasoning. The result feels less
like a generic STAR drill and more like preparing for the screen you're
actually walking into.

### Research-inspired opening questions

The first question of every session is shaped by live research, not pulled
from a static bank. When a session starts, InterviewPie fires two parallel Google
searches via Serper — one for the company in general, and one specifically
for its **behavioral interview style and culture** for the candidate's
target role (the generic "interview questions" corpus was deliberately
dropped because it's dominated by LeetCode and system-design content). A
Gemini summarization pass distills both into a compact brief that includes
two new fields the opening-question generator conditions on: **role values**
— what the company is documented to look for in applicants for this
specific role (cultural and soft-skill traits only — technical proficiencies
are explicitly excluded), and **common question themes** — short labels (never
verbatim questions) drawn from any behavioral interview leaks the search
surfaced. For small or obscure companies where no concrete signal exists,
both fields come back empty rather than invented, and the question
generator falls back cleanly to the field-tailored defaults instead of
hallucinating a role profile.

On top of the brief, the generator samples two of five example question
shapes per call from a per-field-category pool. That randomized rotation
breaks the "fixed attractor" effect where the same model running the same
prompt converged on the same question across companies — a beta-tester
complaint that "Tell me about a time you faced a difficult technical
challenge…" arrived verbatim at five different big-tech screens in a row.
The post-session summary surfaces the same role values and question themes
as bullets in the Company brief card, so the candidate can see what shaped
the questions they were just asked.

To stop the same opening question recurring across back-to-back sessions,
InterviewPie caches each candidate's three most recent opening questions and feeds
them back into the generator as an explicit avoid-list, so the next question
has to take a distinct angle. The cache is scoped to the candidate (not the
company), since opening questions track role and seniority more than which
company you're interviewing at, and it resets whenever you change your target
role, industry, or experience level — the point at which older questions stop
being relevant.

### Six-dimension rubric with per-turn coaching

Every answer is scored 0–10 on six dimensions: **Structure, Problem Solving,
Impact, Initiative, Depth,** and **Delivery**. Five come from the LLM
evaluator; Delivery comes from your webcam (see next section). Each turn
ships back with structured coaching that balances what worked with what to
fix. The evaluator quotes exact transcript snippets for 1–3 positive moments
("keep doing this") and 2–4 improvement moments, then gives bite-sized
suggestions such as adding the customer's actual concern, one reasoning
sentence, or a small outcome. The goal is specific feedback without turning
the product into a full answer generator.

### Filler words, as a rate — not just a count

Every answer is scanned for the usual verbal crutches — _um, uh, like, you
know, basically, actually_ — but a raw tally is misleading: a longer, better
answer almost always contains more of them. So InterviewPie reports the **filler-word
rate**: the percentage of your words that were fillers. A four-minute answer
with twelve "likes" can be _cleaner_ than a thirty-second one with four, and
the rate is what tells you that. It shows up as a color-graded bar — green
under 5%, yellow to 10%, orange to 15%, red above — on the session overview,
under each turn's scores, and as a "filler rate over time" trend on your
History page so you can watch it fall across sessions. The lifetime figure is
word-weighted, so one rambling session can't quietly skew it, and the History
page also breaks out your five most-used filler words so you know which habit
to target first.

### Body-language coaching from your webcam

A 478-point MediaPipe face-landmark mesh runs in the browser at 15 fps while
you're answering, tracking eye contact, gaze stability, head pose, expression,
and face visibility. Those signals roll into the **Delivery** score and into
the structured feedback — so you'll get pointed feedback like _"Eye contact landed
at 47/100; pick a spot near the camera and return to it between phrases."_
This is the part of InterviewPie we lean on hardest: rather than a single averaged
number, the Delivery score is computed deterministically from those signals,
weighting the cues recruiters actually react to — eye contact and staying
on-camera — far above softer ones, so you're never docked for a calm, even
expression the way you are for staring at the floor or dropping out of frame.
The feedback then breaks out into separate plain-English cues for eye contact,
framing, posture, and expression, each with its own score and fix, so you know
exactly which one is costing you and what to do about it. On the replay screen,
the face-mask overlay redraws the landmarks on your recording so you can _see_
what the model saw. Decline the camera and everything else still works.

### Personalization from your resume

Onboarding takes a PDF resume and a short bio, extracts the text, and
captures industry, target role, and experience level. Every downstream prompt
— the opening question, the follow-up, the evaluator — is conditioned on
that profile, so the interviewer references your actual projects, internships,
and seniority instead of asking a stock question about teamwork.

Experience level is a first-class second axis on top of the 15 field buckets:
the company research, opening question, and evaluator rubric are all re-tuned
to your seniority, so an intern is probed on learning-in-ambiguity and scored
on coachability while an executive is probed on portfolio bets and scored on
enterprise leadership — same company, very different interview.

### Voice-native session loop

The whole session runs through voice: question audio plays, the mic engages
automatically when it ends, you talk, you press **End answer**, and the next
question arrives. You choose the session length up front — anywhere from **2
to 8 turns** — and the interview is broken into short "story blocks": a fresh
opening question followed by one or two follow-ups that drill into what you
actually said. Whether a second follow-up comes is decided on the fly — a
lightweight model call judges whether your answer left a gap worth probing, so
a complete answer moves on to a new scenario instead of being padded with a
forced extra question. Each follow-up is conditioned on the same field category
and company-research signals (role values, behavioral themes) that shaped
the opening question, so it lands in the right tone for the role and gently
redirects rather than echoing back if your answer was off-topic or
nonsensical. You can pick from a pool of accented interviewer voices
(or let the system surprise you) so non-native English speakers can rehearse
against the kind of voice they'll actually face in a screen. The chosen voice
persists across every turn so the interviewer never "changes person" mid-session.

If you have to stop early, the turns you already finished aren't thrown away:
quitting a session with at least one completed answer scores and saves it on
just those turns, so an interrupted interview becomes a shorter graded one
rather than a total loss.

### Session history and trend chart

Every completed session is persisted with its transcript, scores, audio
replay, and filler-word breakdown. The History page renders an interactive
trend chart of all six dimensions across every session you've ever done — so
improvement (or regression) on Structure, Impact, or Delivery is visible at a
glance instead of guessed at. You can open any past session and re-listen to
your own answer next to the score that explains why.

### Save a question and re-practice it over time

Most prep tools are one-and-done: you answer a question once and never see it
again. InterviewPie lets you **save an opening question** straight from the results
screen and come back to it later, so you can drill the same scenario until the
answer is sharp. Each saved question keeps its own progress chart — every
re-practice is one point, oldest to newest, plotting the opening answer's
per-dimension scores and their average, so you can watch a specific question
get better instead of inferring it from your overall trend.

The key design choice is that a saved question is a **frozen snapshot**, not a
live pointer. The company, the job title, and your experience level are captured
the moment you save, and every re-practice replays that exact setup even if you
later change your profile — so the follow-up framing and the evaluator's rubric
stay identical across attempts and the comparison is genuinely apples-to-apples.
(Fixing this also closed a latent bug where changing your experience level
mid-session could shift the second turn's rubric.) Re-practice is fast because
it skips the company-research and question-generation model calls entirely and
reads the frozen question back; only the interviewer voice is regenerated, so
you can hear it in a different accent each time. You can keep up to five saved
questions at once, and deleting one never erases the practice sessions behind
it — they stay in your history.

### Free tier with daily session limits

InterviewPie currently ships a single **Free** tier, capped at **5 completed
interview sessions per day**. The counter resets at midnight in your own
local timezone (not server time), and only ticks up when a session
actually finishes — abandoning mid-session doesn't burn a slot. A **Pro**
tier with unmetered sessions is on the roadmap but not yet exposed;
everyone is on Free today.

### Internal incident log

The backend keeps an internal `incidents` table for security and product
auditing. It records backend-observed account creation/sign-in events,
OpenAI moderation requests, successful interview session starts, and server
errors. Incident writes are best-effort and isolated from the main request so
the audit trail never breaks an interview flow; moderation payloads and errors
are capped before storage. This log is intended for admins and debugging, not
for regular user-facing APIs.

---

## Tech stack & architecture

A small, deliberately boring stack — React + FastAPI + Postgres, with a
handful of sequential LLM calls per session that scale with its length (no
multi-agent loop). The frontend is
React 19 + Vite + Tailwind 4 with Clerk for auth, MediaRecorder for capture,
and MediaPipe Tasks Vision for the in-browser face landmark mesh. The backend
is FastAPI on async SQLAlchemy with Alembic migrations against Postgres, all
LLM calls routed through OpenRouter. The AI layer uses **Google Gemini 2.5
Flash** for company research, field classification, and question generation;
**DeepSeek v3.2** for the evaluator; **ElevenLabs** for both speech-to-text
and text-to-speech; and **Serper** for the Google search that grounds the
company brief.

```
Browser (React + Vite)
  │── Clerk JWT ──────────────────────► FastAPI
  │── MediaRecorder blob (audio) ─────► FastAPI ── ElevenLabs STT
  │── cv_summary JSON sidecar ────────► FastAPI
  │                                       │── Serper + Gemini 2.5 Flash (research + field classification)
  │                                       │── Gemini 2.5 Flash         (opening + follow-up question)
  │                                       │── DeepSeek v3.2            (evaluator, field-tailored rubric)
  │                                       │── ElevenLabs TTS           (interviewer voice)
  │                                       └── Postgres (sessions, turns, metrics, saved questions, incidents)
  └── base64 audio data URL ◄──────────── FastAPI
```

---

## Future improvements

- **Spoken-feedback mode** — pipe the structured feedback back through TTS at the
  end of the session so the review feels like a debrief, not a report card.
- **Comparative analytics** — anonymized cohort percentiles ("your
  Structure and Impact scores trail the median for entry-level SWE
  candidates") would turn the trend chart from a self-comparison into a
  benchmark.
