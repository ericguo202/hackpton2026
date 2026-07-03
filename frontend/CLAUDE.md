# CLAUDE.md

**Frontend** of the AI Behavioral Interview Coach. Product-level plan (evaluator schema, session rules, build order) lives in `../CLAUDE.md` — read that first for domain context.

## Commands

Run from `frontend/`:

- `npm run dev` — Vite dev server (http://localhost:5173; CORS allowlisted on backend)
- `npm run build` — `tsc -b` then `vite build`. **Fails on unused locals/params** (`noUnusedLocals`/`noUnusedParameters`).
- `npm run lint` — flat-config ESLint over all `.ts`/`.tsx`
- `npm run preview` — serve production build locally

No test runner wired up. If you add one, prefer Vitest.

## Required env (`frontend/.env`)

See `frontend/.env.example` for a copy-paste template.

```
VITE_API_URL=http://localhost:8000        # defaulted in lib/api.ts; override for deployed backend
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...    # throws in main.tsx if missing
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX       # optional; unset = analytics fully disabled. Consent is geo-gated (see Analytics)
VITE_GA_DEBUG=false                       # optional; "true" → console.debug every gtag command in dev
VITE_GA_FORCE_REGION=                      # optional dev-only; force a bucket: us | implied | strict, or a country code (US/AU/GB/IN)
```

## Stack notes (non-obvious versions)

- **React 19** + **Vite 8** + **TypeScript ~6** + **Tailwind 4** via `@tailwindcss/vite` (config-less — no `tailwind.config.js`, no PostCSS pipeline).
- **Clerk SDK is `@clerk/react`** (not `@clerk/clerk-react`). Use `<Show when="signed-in">` for gating and `useAuth().getToken()` for JWTs. Don't paste old-SDK snippets.

## Architecture

### Auth + API seam (load-bearing — don't bypass)

1. **`src/lib/api.ts`** — context-free. Owns `BASE_URL`, `buildUrl(path)`, `ApiError`. Safe to import anywhere.
2. **`src/hooks/useApi.ts`** — `useApi()` → `{ apiFetch, isReady }`. Attaches Clerk `getToken()` Bearer, throws `ApiError` on non-2xx. Gate requests on `isReady`.
3. **`src/hooks/useMe.ts`** — single source of truth for current user row. Don't re-fetch `/api/v1/me` elsewhere.

**All API calls go through `useApi().apiFetch`** — never raw `fetch()` (skips auth + shared error shape). Prefer `extractApiErrorDetail(err)` over `err.message` for displaying errors.

**FormData quirk**: `useApi` omits `Content-Type` for `FormData` bodies (browser sets multipart boundary). Setting `application/json` breaks multipart parsing server-side.

### App shell

`main.tsx` wraps `<App />` in `<ClerkProvider>` → `<BrowserRouter>` (react-router v7). `App.tsx` is a route table; auth/onboarding gates in `route-guards.tsx`. Full route table + Setup→Practice handoff in `../CLAUDE.md` "Frontend Routing".

### Analytics consent (geo-gated)

`src/lib/analytics.ts` is the single gate for Google Analytics. Consent is **jurisdiction-aware**, resolved before any `gtag.js` loads:

| Region bucket | Countries | Default before any choice |
|---|---|---|
| `strict` | EU/EEA, UK, India, **everything else + unknown** (fail-closed) | nothing loads; opt-in banner |
| `us` | US | full GA4 (cookies/`client_id`) on by default; notice + opt-out |
| `implied` | AU, NZ, SG | cookieless pings on by default (advanced Consent Mode, `analytics_storage: denied`); notice + opt-out |

- **Region source:** `frontend/middleware.ts` (Vercel Edge Middleware) reads `x-vercel-ip-country` and sets a non-HttpOnly `ip_country` cookie; `getAnalyticsRegion()` reads it (fail-closed to `strict` when absent). **Only runs on Vercel** — under `vite dev` use `VITE_GA_FORCE_REGION`. `strict` is the fallback, so only `US`/`AU`/`NZ`/`SG` are enumerated.
- **The gate is `analyticsMode(): 'off' | 'full' | 'cookieless'`** — GPC or an explicit opt-out → `off` (binding, overrides an explicit grant); an explicit opt-in → `full` anywhere; otherwise the region default. Every dispatch path (`trackPageView`/`trackEvent`) and `initAnalytics()` early-returns on `off`. `cookieless` = gtag loads with `analytics_storage: denied` (aggregate pings, no `_ga`).
- **Two localStorage keys:** `ANALYTICS_CONSENT_STORAGE_KEY` (`'granted'|'denied'|null` — the explicit choice) and `ANALYTICS_NOTICE_ACK_KEY` (`'1'` — a default-on visitor dismissed the notice without opting out; does **not** affect the mode, just stops re-nagging).
- **`AnalyticsConsentBanner`** branches on region: opt-in (Accept/Decline) in `strict`, notice + opt-out (Opt out / Got it) in `us`/`implied`. **`PrivacyPanel`** GA toggle shows the live effective mode. Both still wait out `needsPolicyAcceptance` so they don't stack under the policy modal.
- `window.__ipAnalyticsDebug()` (dev) reports `region` + `mode`. Lawyer memo: root `PRIVACY_REVIEW.md` §1b/§3.

### Type contract with backend

`src/types/` manually mirrors `backend/app/schemas/` — **no codegen**. Update matching type by hand when Pydantic schema changes. Decimal scores arrive as **strings** on the wire — coerce with `parseFloat`/`num()`.

`src/lib/contentPolicy.ts` mirrors the prompt-injection regex in `backend/app/services/_injection.py` (`CONTENT_INJECTION_RE`) for instant client-side validation of bio + pasted-résumé. Backend re-checks authoritatively (and is the only place PDF-extracted résumé text is inspected); keep the two patterns in sync.

### Practice Interview phase shell

Interview half of `Practice.tsx` is **chrome-free, full-viewport** (TopBar gated by `{isDone && …}`). `flex h-screen flex-col` with two children:

1. **Body grid** — desktop `min-[900px]:grid`, `grid-template-columns` flips `[33%_67%]` (transcript closed) ↔ `[25%_50%_25%]` (open). Mobile → vertical `flex flex-col`. Columns under `components/practice/`:
   - **`QuestionColumn.tsx`** — question text + `<audio>`. **Playback is programmatic, not the `autoPlay` attribute** (iOS Safari blocks audible autoplay without a fresh gesture): a `[audioUrl, replayKey]` effect calls `.play()` and, only on `NotAllowedError`, shows an amber "Tap to play the question" fallback (the tap plays + serves as the gesture, then `onEnded` drives recording as usual). `replayKey` bumps (Re-record / Restart-turn / **new turn** — `handleSubmitTurn`) remount the element to re-run that effect. **Bug-1 guard:** the `<audio>` shares a ref (`questionAudioRef`) with `Practice.handleAudioEnded`, which synchronously `pause()`s + detaches the `src` (`removeAttribute('src')` + `load()`) **before** `recorder.start()`'s `getUserMedia` flips the iOS audio session — otherwise WebKit replays the buffer over the recording's first seconds.
   - **`CameraColumn.tsx`** — 16:9 box at **fixed `w-[45vw]` desktop** / `w-full` mobile. The 45vw lock is load-bearing: camera width never changes when transcript opens (grid columns flex around the box). Submit/Re-record below, disabled while `submitting`. The empty/declined placeholder panel **inverts the surface** (`bg-primary-700 dark:bg-primary-100` with text flipped to match, ~14:1) so it reads as a powered-down screen — dark in light mode, near-white in dark mode — never the old cherry fill.
   - **`TranscriptColumn.tsx`** — `min-[900px]:border-l` / `border-t` mobile. X close hidden on mobile (footer toggles).
2. **`PracticeFooter.tsx`** — sticky bottom bar. End recording / Restart turn / Show-hide question / Show-hide transcript / Quit. `FooterButton` hides text via `min-[900px]:inline` (mobile = icon-only). **Button colors are the documented Ten-Percent-Cherry exception:** the primary *End recording* wears amber (`bg-highlight` + `text-primary-700` dark ink — raw scale so it stays dark in dark mode, ~8.8:1), and the destructive *Quit* carries the danger cherry (`bg-accent` + white, 5.9:1). The small pulsing "Recording" dot stays cherry (conventional record indicator).

**`QuitConfirmDialog.tsx`** — owns its ESC effect (only while `open`); backdrop click → `onCancel`.

Old `RecordingStatusPill` removed; recording state surfaced only by footer pill. `analyzer.diagnostics` still consumed by `handleSubmitTurn` for `cv_summary`, not by UI.

### Practice Results phase shell

When `isDone === true`, `Practice.tsx` renders a folder-tab shell mirroring `SessionDetail.tsx`. TopBar covers post-session nav.

Data flow:
- **`sessionDetail`** — from polling `GET /sessions/{id}` after final turn. Final POST does NOT wait for scoring; polls ~2s until `status === "completed"`. Source of truth for Overview, per-turn `TurnDetail`s.
- **`turnResults: ReplayTurnResult[]`** — local-only (object-URL blobs, `cvSummary`, `analyzerDiagnostics`). Survives refetch failure.
- **`effectiveTurns = sessionDetail ? sessionDetail.turns : turnResults.map(replayToTurnDetail)`** — while pending, Overview averages from `turnDetailAverages(effectiveTurns)`; once completed, `sessionDetail.averages` takes over.

**Pending eval is a first-class UI state.** While `status !== "completed"`, null scores = "Scoring in progress". Only after completed do null scores = "Evaluation failed".

Panel components under `components/practice/`:

- **`PracticeOverviewPanel.tsx`** — reuses `<ScoresOverviewColumn>` (named export from `session-detail/OverviewPanel.tsx`).
- **`PracticeTurnPanel.tsx`** — six cards, 3 rows × 2 cols ≥900px. Row 1 container has `min-[900px]:h-[clamp(22rem,30vw,28rem)]` — **don't drop this clamp** (without it sibling-stretch + `aspect-video` leave empty space below video).
- **`ImproveNextCard`** — thin renderer over `feedback_detail.next_take`. Old client-side `PLAYBOOKS`/`questionKindFor` machinery **retired**. Gated on `evaluationPending`/`evaluationFailed` (`EvalStatusNotice`). Props `{ turn, evaluationPending, evaluationFailed }` (no `cvSummary`).

### SessionDetail folder-tab shell

`SessionDetail.tsx` at `/sessions/:id` — folder-tab "case file": three tabs (Overview, Turn 1, Turn 2). Tab reset on `sessionId` change uses **React-19 "compare-prop-to-tracked-state-during-render"**, NOT a `useEffect` setState (trips `react-hooks/set-state-in-effect`).

Components under `src/components/session-detail/`:

- **`FolderTabs.tsx`** — `<button>` tabs `rounded-t-lg border border-b-0` + `-mb-px` overlap (no seam). Full ARIA tabs pattern (←/→/Home/End).
- **`OverviewPanel.tsx`** — left: company brief (omit empty sections — never "(none)"). Right: six `ScoreTile`s; `ScoresOverviewColumn` is a named export for reuse.
- **`TurnPanel.tsx`** — **two independent row grids** (NOT one grid w/ `auto-rows-fr` — that matched both rows to the taller, leaving empty gutters).
- **`_helpers.ts`** — `SCORE_KEYS`, `SCORE_COLOR_MAP`, `num()`, `turnAverage()`, `improvementMomentsOf()`. `SCORE_COLOR_MAP` mirrors `History.tsx:DIMENSIONS` — change one, change both.

**Load-bearing layout facts** (caught/fixed during iteration — don't re-introduce):

- **Tab/corner alignment**: `FolderTabs` strip lives **inside** the card's flex column (not the outer gutter row). Card carries `min-[900px]:rounded-tl-none`. Moving the strip out → active tab floats into gutter; dropping `rounded-tl-none` → card curve artifact.
- **Sticky chevrons**: `items-start` on gutter column + `sticky; top: 50vh; -translate-y-1/2` on wrapper. `items-start` is load-bearing: `items-center` puts natural position at column middle (far below viewport), satisfying `top:50vh` so sticky never engages. `items-start` puts it above threshold → sticky pins at viewport middle from first paint.
- **Native `title`** for chevron hover (not custom tooltip — sticky wrapper's `translateY(-50%)` creates a containing block that broke absolute tooltip positioning).

**Mobile (<900px)**: drops folder strip, chevrons, 2-col layouts → single vertical stack. Nav: horizontal swipe (`|dx|>60 && |dx|>1.5·|dy|`) + a **top pager row** (`FolderTabs.tsx:PagerArrow` — circular 44px chevrons reusing `SideNavButton`'s vocabulary, inert/greyed at the first/last tab, `active:` not `hover:` press feedback). The pager sits at the **top** (replacing the old bottom Prev/Next row + the desktop folder strip + gutter side-arrows below 900px) so the bottom edge stays clear for the floating Ask Tutor + feedback FABs; the page gets `pb-28` on mobile so scrolled content clears those FABs.

**Issue-type chips**: `formatIssueType(raw)` — generic snake_case → Title Case. Don't hard-code a switch (generic handles unknown/legacy).

### Transcript feedback highlighting (shared by Practice + SessionDetail)

The per-turn cards live in **`components/session-detail/_turnInnerCards.tsx`** and are reused by **both** `TurnPanel.tsx` (SessionDetail) and `PracticeTurnPanel.tsx` (Practice) — change the feature once, it lands on both surfaces.

- **Filler highlighting** — `QuestionAnswerCard` renders the transcript via `lib/fillerWords.ts:tokenizeTranscript` (frontend mirror of the backend regex). `renderTranscriptToken` is the shared per-token renderer (yellow `--color-filler` highlighter — a /40 wash behind normal `text-text`, NOT yellow type — vs plain span; `ImproveNextCard`'s filler-distribution bars use the same token as a solid fill).
- **Improvement-moment highlighting + click-to-jump** — flagged sentences are highlighted in brick-red `--color-critique` (`bg-critique/25`, the same color as the Improvement Moments section border/chip) and are clickable: clicking scrolls the matching moment into view and flashes its left border. `--color-critique` is decoupled from action-cherry on purpose — it pairs with the green "What worked" and reads in dark mode where amber didn't. **Dark-mode wash tuning:** the resting wash was too faint on espresso, so `dark:bg-critique/40` raises it to the level light mode only hit on hover, and `dark:hover:bg-critique-hover/40` lifts hover to a lighter red (`--color-critique-hover` = `#F08193`) so the hover affordance is still felt. Light mode keeps the plain `/25 → /40` ramp.
  - **Matching (`lib/transcriptHighlight.ts:segmentTranscriptByImprovements`)** splits the transcript into `plain` / `improvement` segments. Each snippet is located by its **trimmed** value via `indexOf` — mirroring the backend's `_drop_unanchored_moments` (`snippet.strip() in transcript`) guarantee. **Rule: a snippet that doesn't appear verbatim is NOT highlighted** (graceful no-op on legacy/edge data). Overlapping snippet ranges are dropped greedily (earliest wins) so spans never nest into each other. Every segment is itself run through `tokenizeTranscript`, so **filler highlights nest inside** improvement spans (the two layers stack, not fight).
  - **Index source of truth**: both cards derive the moments array (and therefore each `momentIndex`) from `_helpers.ts:improvementMomentsOf(turn)` (`improvement_moments ?? coaching_moments ?? []`) so the transcript→moment link can't drift. That array is **sorted by transcript order** (the `byTranscriptOrder` helper — stable sort on each snippet's first trimmed `indexOf`; non-matching snippets fall to the end) so the list reads top-to-bottom in answer order; sorting at this single source is what keeps the `momentIndex` link intact. The same helper backs `positiveMomentsOf(turn)` ("What worked"), which has no jump-link but reads in the same order.
  - **Flash channel (`_momentFlash.ts`)** — a per-turn React context (`MomentFlashContext` / `useMomentFlash` / `useProvideMomentFlash(turn.id)`). The transcript card and the moments card sit in separate grid rows, so the click→flash path goes through context, not props. Each panel wraps its content in `<MomentFlashContext.Provider value={useProvideMomentFlash(turn.id)}>`. DOM ids are deterministic (`improvement-moment-${turn.id}-${i}`; `turn.id` is stable for real turns AND Practice replay turns `local-${idx}`). Scroll happens in an effect (post-render) so the target exists after re-key remount; a ref-backed `nonce` lets a repeat click of the **same** snippet replay (the moment `<li>`'s `key` includes the nonce → remount → CSS animation re-runs).
  - **Animation** — `index.css:.moment-flash` / `@keyframes moment-flash-border` brightens the left border to `--color-critique` + a brief left-edge glow, no `forwards` fill so the resting `border-critique/45` reclaims the property. Included in the `prefers-reduced-motion: reduce` reset (and `scrollIntoView` falls back to `behavior: 'auto'`).

### Save & re-practice opening questions

- **Types** in `src/types/savedQuestions.ts`; `SessionDetail` gained `saved_question_id: string | null`.
- **Hooks**: `useSavedQuestions()` (list + `save`/`remove`/`rePractice`) and `useSavedQuestionDetail(id)` (exposes `errorStatus`).
- **`SaveQuestionButton.tsx`** — 3-state (Save / Saved disabled / Full disabled at 5/5). Mounted **opening turn only** (`turn_number === 1 && !is_followup`) in `TurnPanel.tsx` + `PracticeTurnPanel.tsx`. In Practice, visible but disabled until polling gets completed scores.
- **History section** — `SavedQuestionsSection` above "Sessions", hidden when zero. Re-practice → `POST /saved-questions/{id}/practice` → `navigate('/practice', {state})`. Row click → `/saved-question/:id`.
- **`pages/SavedQuestionDetail.tsx`** — recharts `LineChart`: Overall + per-dimension lines across attempts. **Overall recomputed frontend-side as mean of turn-1 dims** (`openingOverall()`) — NOT session blended `overall_score` (fixes turn-1-vs-blended mismatch). Failed-eval attempts get a marker, **not plotted** (never a 0 point).

### Setup Advanced panel — pasted job description

The Home setup screen's Advanced panel (`AdvancedPanel.tsx`, wrapped on mobile by `AdvancedPanelDrawer.tsx`) takes an **optional job description** textarea. Backend contract in `../CLAUDE.md` → "Optional pasted job description".

- **Cap mirror:** `MAX_JOB_DESCRIPTION_CHARS = 6000` (exported) mirrors `SessionCreateIn.job_description`; `maxLength` + a remaining-char counter shown only within 500 of the cap. Instant client-side `violatesContentPolicy(jobDescription)` gate (mirrors the bio/résumé gate; backend re-checks authoritatively).
- **`Home.tsx` flow:** `createAndGoToSession(deliveryAnalyticsWillBeEnabled, acknowledgeMismatch=false)` POSTs `job_description`/`acknowledge_mismatch` only when set. A **409** (`ApiError.status === 409`) opens `MismatchConfirmDialog` — its message is parsed by `mismatchMessageFrom(err)` since the 409 `detail` is a non-string `{code, message}` object (so `extractApiErrorDetail` returns raw JSON). "Continue anyway" re-calls `createAndGoToSession(_, true)`, which sets `acknowledge_mismatch: true` and skips the server match-check. (429 still routes to the FlashBanner daily-limit path, unchanged.)
- **`MismatchConfirmDialog.tsx`** — modal (`role="dialog"`, ESC + backdrop → cancel) confirming the user wants to proceed past a flagged role/industry/company ↔ JD mismatch.

### Ask Tutor (turn-scoped chat)

Floating, **non-modal** career-advisor chat scoped to one turn. Backend contract + persona rules in `../CLAUDE.md` → "Ask Tutor". Components under `src/components/session-detail/ask-tutor/`; mounted by **both** `TurnPanel.tsx` (SessionDetail) and `PracticeTurnPanel.tsx` (Practice post-session view) — each wraps its content in its own `AskTutorContext.Provider` (`useProvideAskTutor()`). In Practice, `AskTutorButton` takes `disabled` (defaults false → SessionDetail unchanged) and is greyed while a turn is still scoring (`evaluationPending`) — no feedback to discuss yet, so entry is blocked to avoid spending tutor tokens + the daily chat quota on an empty context.

- **State machine** in `_askTutor.ts` (context: `closed | minimized | open`). `AskTutorChat.tsx` is the shell; **conversation lives in `useTutorChat.ts`** (extracted per the "extract from long components" rule). The chat is **ephemeral** — held in memory, nothing persisted; a tab switch unmounts and discards it (blank slate on return).
- **Streaming seam:** `useApi().apiStream(path, init)` returns the raw `Response` (auth header + `ApiError` on non-2xx, but no `.json()`), and `lib/sse.ts:readSSE` parses the `event:`/`data:` frames. `useTutorChat.send` POSTs `{message, history, context_snippet}` and folds `tool`/`token`/`done`/`error` events into a discriminated-union message list (`{kind:'text'}` bubbles + `{kind:'tool'}` step chips). **History is text bubbles only, each clamped to 4000 chars** (matches the backend schema cap so a long reply can't 422 the next message); tool chips are excluded.
- **Composer guards (abuse caps; mirror the backend — see `../CLAUDE.md` → "Ask Tutor → Abuse caps").**
  - **Per-message length:** the textarea has `maxLength={MAX_MESSAGE_CHARS}` (300, from `types/tutor.ts`) + a near-limit char counter (shown only when ≤40 left, amber at the cap); `submit` also `slice(0,300)`s defensively. The "Ask about this" `context_snippet` is separate and **not** counted toward the 300.
  - **Daily cap (10/day free):** `useTutorChat` tracks `remaining: number | null` (null = Pro / unknown). **Seeded once from `useMe().me.daily_chat_count`** during render (React-19 "compare-to-tracked-state" pattern, not an effect, so a live decrement is never clobbered by a later `/me` broadcast), then driven live by the `done` event's `remaining` and set to `0` on a `429`. `send` early-returns when out. `AskTutorChat` derives `limitReached`/`showLowHint`: at ≤3 left a muted `text-text-subtle` "N left today" hint; at 0 the textarea **and** send button disable and a red `text-critique` "resets at midnight" message shows (starters hidden), while the rest of the chat stays usable.
- **Markdown rendering — `TutorMarkdown.tsx`.** Tutor bubbles render through it; **user bubbles + tool labels stay raw** (`{...}` — users type plain text). It renders the tight subset the model is allowed to emit: `**bold**`, `*italic*`/`_italic_`, hyphen bullets (`<ul>`), numbered lists (`<ol>`). **Deliberately NOT a markdown library** — the subset is tiny and this stays XSS-safe by construction (only emits `<p>/<strong>/<em>/<ul>/<ol>/<li>` with React-escaped text; no `dangerouslySetInnerHTML`, no link/href path — load-bearing since replies echo untrusted transcript text). Anything outside the subset (a stray `#`/backtick) renders as **literal text**. The inline parser is **streaming-tolerant**: an unclosed `**`/`*` mid-stream falls back to its literal characters and resolves on the next token, so no broken markup flashes. Keep this in sync with the backend prompt's allowed-markdown rule (`tutor.py` `_PERSONA`).
- **Desktop window mechanics (≥900px):** the window is `position: fixed` anchored bottom-LEFT (bottom-right is the global feedback FAB). Draggable by its header (translate offset via `--atx/--aty` CSS vars + a desktop-gated rule, so the mobile bottom-sheet layout is untouched); header **expand** toggle fills available height + widens via `--atw/--ath`; double-click header resets position + size; viewport-resize re-clamps.
- **Mobile bottom-sheet resize (<900px):** the grab handle is now **drag-to-resize**, and a tap (pointer move < `TAP_SLOP` px) still minimizes — keyboard Enter/Space also minimizes (click `detail === 0`). Drag sets an explicit sheet height via the `--msh` CSS var, applied only in a `max-width:899px` rule (`data-msized`), so desktop drag/size geometry is never touched. `touch-action:none` on the handle keeps the vertical drag from scrolling the page. Clamp range is `[sheetFloorH(), MOBILE_MAX_VH·vh]`; the **compress floor is measured live** (handle + header + composer offsetHeights + `SHEET_PEEK`), NOT a constant — the composer grows with starter chips / snippet chip / char counter, so a `ResizeObserver` on the composer lifts the sheet if it would clip the composer below the floor, and resize re-clamps the floor too. iOS Safari fix: the typing-dots keyframes use `translate3d` + `will-change` (own compositing layer) because WebKit silently drops transform/opacity anims on descendants of a momentum-scroll container.
- **Z-INDEX — portal to `document.body` (load-bearing).** Both the open window and the minimized pill are `createPortal(…, document.body)`. The SessionDetail tabpanel carries `anim-crossfade` (an **opacity animation = a stacking context**); rendered inside it, the window's `z-[60]` would be trapped beneath the sibling `z-10` folder-tab strip, letting the tabs paint over the chat. The portal lifts it into the root stacking context where `z-[60]` is authoritative (below the `z-[70]`/`z-[80]` modals, correctly). React context flows through the portal, and the fixed/drag geometry (viewport-relative rect math) is unaffected.
- **Types** in `src/types/tutor.ts` mirror `backend/app/schemas/tutor.py` + the SSE events by hand (no codegen): `TutorDoneEvent.remaining?` and `MAX_TUTOR_CHATS_PER_DAY` (= backend `DAILY_CHAT_LIMIT_FREE`); the daily count comes from `MeResponse.daily_chat_count` in `src/types/user.ts`. On `ApiError`: **429 → set `remaining=0` and return (no bubble; the disabled/red-footer state speaks for it)**; 422 → soft tutor bubble using the server detail (moderation refusal / redirect / message too long); 503 → "content checks unavailable" bubble.

## House style

- `MePing` is a deliberate debug widget rendering `/me` JSON — leave during dev, remove before demo.
- Components have terse header doc-comments explaining their role in the flow — keep this style for new ones.

## Design system

InterviewPie 2026 rebrand (root `DESIGN.md`, "Prep Kitchen"; stage 3 "Baked, not bloody"): warm vanilla-cream surface, cherry action color, amber garnish/identity, **DM Sans 600/700 headings over Inter body** (Geist Mono reserved for code). Wired through Tailwind 4's `@theme` block in `src/index.css` — **no `tailwind.config.js`, and none should be added**.

`src/index.css` `@theme { ... }` is the single source of design tokens — never hand-type hex/`px` in components.

### Color system

Nine legacy scales (`primary`…`grey`), stops `100`(lightest)→`700`(darkest), collapsed into one warm-neutral family tinted toward the brand amber hue. `primary/700` (`#271812`) is cocoa "ink". The page bg is the semantic `--color-surface` = warm vanilla-cream `#F5E7CF` (NOT `primary/100`, which stays `#FDF8F2` as a raw-scale anchor). Brand tokens live alongside: `--color-cherry` (+`-deep`/`-glaze`/`-tint`) and `--color-amber` (+`-deep`/`-tint`). **Emphasis is split from the action accent (stage 3):** `--color-link` (cherry→amber in dark) for links/inline accent/active-underline; `--color-highlight` (amber both themes) for amber emphasis — the `amber` Button variant (Practice *End recording*/*Submit answer*) and the "Improve next" coaching-card borders; `--color-critique` (brick-red, `#B8253C`→`#E5556B` dark) for the improvement-moment system; `--color-filler` (yellow — deep gold `#9A7C0A` light → bright `#F2D84E` dark) for filler highlights, the second-tier "could improve" note ranked below the red. `--color-accent` stays cherry for buttons/selection.

**Named rules (DESIGN.md §2):** cherry covers ≤~10% of any screen and usually less — it's the action color (primary + destructive buttons, selection fill); two competing cherry elements means one is wrong. Amber is garnish in light (never type/white-fill; fills, washes, chart ink only) and **leads in dark** (earns text rights ≥9:1, carries links + active-underline + focus ring). The only red kept in dark mode is the one CTA, destructive buttons, error alerts, and danger labels (cherry-glaze) — never decorative.

### Token hierarchy — prefer semantic tokens; reach for raw scale only when no alias fits.

| Use case              | Semantic utility               | Resolves to (light)    |
| --------------------- | ------------------------------ | ---------------------- |
| Page background       | `bg-surface`                   | vanilla-cream `#F5E7CF`|
| Card / elevated panel | `bg-surface-raised`            | card white `#FFFFFF`   |
| Subtle well / input   | `bg-surface-sunken`            | sunken `#F6EDE2`       |
| Default border        | `border-border`                | warm hairline `#E8DCCB`|
| Stronger border       | `border-border-strong`         | `#D4C3AC`              |
| Body text             | `text-text`                    | ink `#271812`          |
| Muted text            | `text-text-muted`              | `#6E5D50`              |
| Subtle / helper text  | `text-text-subtle`             | `#685440`              |
| Primary button        | `bg-accent` + `text-accent-fg` | cherry `#C41E3A` + white |
| Primary button hover  | `hover:bg-accent-hover`        | cherry-deep `#A8172F`  |
| Amber action button   | `bg-highlight` + `text-primary-700` (or `<Button variant="amber">`) | amber `#FFA630` + dark ink (both themes; Practice *End recording* + *Submit answer*) |
| Link / inline accent  | `text-link` / `decoration-link`| cherry `#C41E3A` (→ amber in dark) |
| Improvement highlight | `bg-critique/NN` / `border-critique` / `dark:text-critique` | brick-red `#B8253C` (→ `#E5556B` dark) |
| "Improve next" border | `border-highlight/45`          | amber `#FFA630` (both themes) |
| Filler highlight      | `--color-filler` /40 wash + `text-text` (chip); solid for bars | yellow: deep gold `#9A7C0A` (→ bright `#F2D84E` dark) |
| Focus ring            | `ring-focus-ring`              | cherry (amber in dark) |

### Typography

- `--font-display` = **DM Sans** (the wordmark face); `--font-sans`/`--font-ui` = **Inter**. Inter never renders headings.
- Base `h1..h6` set `--font-display`, **weight 600** (the Wordmark Weight Rule: 700 belongs to the brand name + at most one display statement per page), tight letter-spacing, responsive `clamp()`. h1/h2 clamp upper bounds (`4.5rem`/`2.75rem`) tuned for wide monitors — don't lower.
- `--font-mono` = Geist Mono (not `@import`ed; falls back to `ui-monospace`).

### Buttons

`ui/button.tsx` is the single button vocabulary: **full pill** (`rounded-full`), cherry `default`/`destructive` (the label, not a new color, carries destructive meaning), bordered `outline` for secondary/cancel actions. `GetStartedButton` (chevron-slide pill) is landing-only. `FlowHoverButton` was retired in rebrand stage 2 — don't reintroduce ink-sweep hovers.

### Wide-monitor scaling — three coupled mechanisms, touch all three together:

1. **Root font-size media queries**: 16→17px (≥1536), 18px (≥1920), 20px (≥2560). **Use rem / semantic size utilities** — hard-coded `text-[NNpx]` doesn't scale.
2. **h1/h2 `clamp()` upper bounds** — `vw` term grows between breakpoints, cap stops it.
3. **`2xl:max-w-[88rem]`** (`92rem` for Practice/SessionDetail) on outer containers. Inner typographic max-widths stay tight — line-length caps, should NOT grow with viewport.

**Explicit exceptions** (stay hard-coded px): `text-[10px] uppercase tracking-eyebrow` micro-labels (`text-eyebrow = 11px` covers most).

**Don't add content to fill empty space on wide monitors** (`frontend/.impeccable.md`: "Empty space is content").

### Radius

Default `--radius` = `12px`. `rounded`(12) · `rounded-lg`(16) · `rounded-xl`(24) · `rounded-full` · `rounded-sm`(8)/`rounded-xs`(4). Never `rounded-none` unless explicitly called for.

### Focus states

Always visible: `focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. Don't remove `outline` without a visible ring replacement.

### Dark mode

Class strategy on `<html>` + curated token swap (**warm espresso** `#1E1711`, no maroon cast, NOT an inversion).

- **Mechanism**: `html.dark { … }` overrides **only semantic aliases + six `--color-chart-N` + rate bands**. Specificity: `html.dark` (0,1,1) beats `@theme`'s `:root` (0,1,0). `@custom-variant dark (&:where(.dark, .dark *))` for one-off `dark:` utilities.
- **No-flash init (`index.html`)**: blocking inline script sets `dark` class before first paint. First visit follows OS `prefers-color-scheme`; then `localStorage['theme']` wins.
- **State**: `src/hooks/useTheme.ts` — `useSyncExternalStore` whose snapshot is the `<html>` class. `ThemeToggle.tsx` in TopBar (always visible).
- Primary + destructive buttons stay cherry-with-white in both themes; dark hover **brightens** (`#D63B53`) instead of darkening. Inline links/accent text use `text-link` (cherry in light, **amber in dark** — the stage-3 swap that retired ambient `dark:text-cherry-glaze`); the focus ring flips to amber. `cherry-glaze` is now reserved for semantic red that must stay red in dark: error alerts (`role="alert"`) and danger labels.
- The manila "case file" exception was **retired in rebrand stage 2**: the SessionDetail/Practice folder card is plain `bg-surface-raised`, inner tiles are `bg-surface-sunken`, and the `html.dark .bg-tertiary-200` re-scoping blocks are gone from `index.css`. Don't re-pin light surfaces in dark mode.
- **Clerk is theme-aware**: `main.tsx` wraps `ClerkProvider` in a `Root` reading `useTheme()`, builds `appearance` from light/dark `variables` (light: white/ink/cherry; dark: espresso/cream/cherry — `colorPrimary` is cherry in both themes since the CTA never changes color).
- Calibration camera box uses an intentionally-dark raw hex (`#150D0F`, correct in both themes); SignIn/SignUp recolor the dither shader per theme via `useTheme()`.

### Tech debt

The built-in Tailwind gray/red migration is **done** (rebrand stage 2) — components use semantic tokens throughout. No `--color-danger`/`--color-success` tokens yet — destructive reuses cherry by doctrine; add tokens to `@theme` only if a genuinely separate semantic emerges.

## Design Context

Canonical sources: root `PRODUCT.md` + `DESIGN.md` (the 2026 "Prep Kitchen" spec); stage briefs in `.impeccable/`.

**Users** — Primary: undergrads prepping internship/new-grad behavioral interviews. Secondary: recent grads doing repeat sessions.

**Design principles**: (1) Studio, not cram — remove chrome before adding. (2) Adult vocabulary — cut hype, exclamation marks, Duolingo-tone. (3) Restraint signals premium — no gradients/shadows/stat counters/illustrations/mascots, no bakery kitsch. (4) One primary action per surface, marked in cherry. (5) Metrics are data, not rewards — no animated fills/green checkmarks. (6) Eyebrow labels are a data-label voice (metric displays, one running head per page) — never section scaffolding.

**Hero principles**: typography carries emotional load (DM Sans 600/700 display on the vanilla-cream surface); one action alone in negative space; asymmetric left-aligned; empty space is content.
