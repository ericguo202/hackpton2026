# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **frontend** of the AI Behavioral Interview Coach hackathon project. The product-level plan (evaluator schema, session rules, build order, cut list) lives in `../CLAUDE.md` — read that first for domain context.

## Commands

Run from `frontend/`:

- `npm run dev` — Vite dev server (http://localhost:5173; CORS allowlisted on the backend)
- `npm run build` — `tsc -b` then `vite build`. Build will fail on unused locals/params (`noUnusedLocals`/`noUnusedParameters` in `tsconfig.app.json`).
- `npm run lint` — flat-config ESLint over all `.ts`/`.tsx`
- `npm run preview` — serve the production build locally

No test runner is wired up. If you add one, prefer Vitest for Vite compatibility.

## Required env (`frontend/.env`)

```
VITE_API_URL=http://localhost:8000        # defaulted in lib/api.ts; override for deployed backend
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...    # throws in main.tsx if missing
```

## Stack notes (non-obvious versions)

- **React 19** + **Vite 8** + **TypeScript ~6** + **Tailwind 4** via `@tailwindcss/vite` (no `tailwind.config.js` — Tailwind 4 is config-less by default; import happens through the Vite plugin, not a PostCSS pipeline).
- **Clerk SDK is `@clerk/react`**, not the older `@clerk/clerk-react`. API surface differs — use `<Show when="signed-in">` for auth gating and `useAuth().getToken()` for JWTs. Don't paste snippets from the older SDK.

## Architecture

### Auth + API seam (this is the load-bearing pattern)

Three files work together — don't bypass them:

1. **`src/lib/api.ts`** — context-free. Owns `BASE_URL`, `buildUrl(path)`, and the `ApiError` class. Safe to import from anywhere (tests, non-React code).
2. **`src/hooks/useApi.ts`** — the React-context-bound fetcher. `useApi()` returns `{ apiFetch, isReady }`. `apiFetch` calls Clerk's `getToken()`, attaches `Authorization: Bearer`, and throws `ApiError` on non-2xx. Gate requests on `isReady` (which is Clerk's `isLoaded`) so you don't fire before the session rehydrates on first mount.
3. **`src/hooks/useMe.ts`** — single source of truth for the current user row. `App.tsx`, `OnboardingForm`, and `MePing` all consume this hook — do not re-fetch `/api/v1/me` elsewhere.

**All API calls go through `useApi().apiFetch`.** Never call `fetch()` directly to the backend — you'll skip auth and bypass the shared error shape.

When rendering backend errors, prefer `extractApiErrorDetail(err)` from `src/lib/api.ts` over `err.message`; `ApiError.message` intentionally contains status + raw body for debugging and will show JSON to users. `Practice.tsx` additionally maps the moderation 422 to "This violates the usage policy. Please re-record and try again."

**FormData quirk**: `useApi` detects `FormData` bodies and intentionally omits `Content-Type`, letting the browser set the multipart boundary. If you hand-roll a request with FormData, do the same — setting `application/json` breaks multipart parsing server-side.

### App shell

`src/main.tsx` wraps `<App />` in `<ClerkProvider>` then `<BrowserRouter>` (react-router v7). `src/App.tsx` is a route table; auth and onboarding gates live in `src/components/route-guards.tsx` (`RequireAuth`, `RequireOnboarded`, `RedirectIfOnboarded`) and compose via nested layout routes. `/` is the only auth-bivalent route — `HomeRoute` branches on Clerk `<Show>`: signed-out → `<Hero />`, signed-in → either `<Navigate to="/onboarding" />` (if not yet onboarded) or `<Home />`. Full route table + the Setup-→-Practice handoff via `useLocation().state` are documented in `../CLAUDE.md` under "Frontend Routing".

### Type contract with backend

`src/types/user.ts` manually mirrors `backend/app/schemas/user.py` (`UserOut`). There is no codegen. When the Pydantic schema changes, update `MeResponse` by hand — and vice versa. The backend lives at `../backend` (sibling directory, not a submodule); read it directly for the canonical shape.

### Routes currently wired

The full MVP surface is built. The frontend consumes (each behind a hook following the `useMe` pattern — never inline `apiFetch` in components): `/me` + `/me/stats` (`useMe`, History stats), `/onboarding` (`OnboardingForm`), `/sessions` + `/sessions/{id}` + `/sessions/{id}/turns` (`useSessions` / `useSessionDetail`, Practice + History + SessionDetail), the `/saved-questions` family (`useSavedQuestions` / `useSavedQuestionDetail` — see "Save & re-practice opening questions" below), and `/validation/industries` + `/validation/roles` (the onboarding/Personalize comboboxes). The canonical request shapes live in `../CLAUDE.md` under "API Routes"; mirror any backend schema change into `src/types/` by hand (no codegen).

### Practice Interview phase shell

The Interview half of `Practice.tsx` is **chrome-free and full-viewport**: TopBar is wrapped in `{isDone && …}` so it only renders during Results. The Interview branch is a `flex h-screen flex-col` container with two children:

1. **Body grid** — desktop renders `min-[900px]:grid` whose `grid-template-columns` flips between `[33%_67%]` (transcript closed) and `[25%_50%_25%]` (transcript open). Mobile collapses to a vertical `flex flex-col` stack. Three column components, all under `components/practice/`:
   - **`QuestionColumn.tsx`** — eyebrow + invisible-underlay question text + `<audio>`. Sole consumer of `replayKey` (the audio remounts to retrigger `autoPlay` whenever Re-record OR the footer's Restart-turn button bumps the key). `min-[900px]:border-r` divider.
   - **`CameraColumn.tsx`** — 16:9 box at **fixed `w-[45vw]` on desktop**, `w-full` on mobile. The 45vw lock is load-bearing for "camera width never changes when the transcript column opens" — the grid columns flex around the box (50% column tightly hugs the 45vw box with ~2.5vw gutter; the 67% column has more breathing room). Renders `<CameraPreview>` when `videoStream != null`, the recorded video when `showPreview`, otherwise a dark `bg-accent` placeholder with state-aware copy ("Camera will start once the question audio ends." / "Webcam not enabled — audio recorded only."). Submit / Re-record buttons render below the box and disable while `submitting`.
   - **`TranscriptColumn.tsx`** — `min-[900px]:border-l` desktop / `border-t` mobile. X close button hidden on mobile (mobile toggles transcript only via the footer).
2. **`PracticeFooter.tsx`** — sticky bottom bar (`h-20 shrink-0 border-t bg-surface-raised`). Left side: "Turn N" indicator + recording-state pill. Right side: five icon+label buttons (End recording / Restart turn / Show-hide question / Show-hide transcript / Quit session). The local `FooterButton` helper hides its text span via `min-[900px]:inline` so mobile renders icon-only. The End-recording button overrides the neutral defaults via className (`border-accent bg-accent text-accent-fg hover:bg-accent-hover`) — twMerge resolves the conflict. During `submitting`, the right-side button row is replaced by an inline spinner + status message. The big-red Quit button is a separate `QuitButton` inline helper, not a `FooterButton`.

**`QuitConfirmDialog.tsx`** is mounted as a sibling of the body+footer container; it owns its own ESC-key effect (registered only while `open`), backdrop click closes via `onCancel`, inner card stops propagation.

Both Interview and Results phases are now chrome-light by design. The old `RecordingStatusPill` component (and its `getAnalyzerStatusLabel`/`Class` helpers) was removed entirely; recording state is now surfaced only by the footer's pill. `analyzer.diagnostics` is still consumed by `handleSubmitTurn` for `cv_summary` payloads and logging, just not by any UI element.

### Practice Results phase shell

When `isDone === true`, `Practice.tsx` renders a folder-tab "case file" shell that mirrors `SessionDetail.tsx` — same `FolderTabs` + circular `SideNavButton` chevrons in desktop gutters, same `sticky top-[50vh] -translate-y-1/2` + `items-start` choice for the chevrons (load-bearing — see the SessionDetail section below for why), same mobile collapse to swipe + Prev/Next FlowHoverButton row, same `anim-crossfade` panel transition. The previous pill-dot stepper + slide animation + bottom CTA row are gone; TopBar covers post-session navigation.

The data flow has three pieces:

- **`sessionDetail: SessionDetail | null`** — populated by polling `GET /sessions/{id}` after the final turn returns. The final-turn POST intentionally does **not** wait for scoring; Practice enters Results immediately, then polls every ~2s until `sessionDetail.status === "completed"`. Once completed, `sessionDetail` is the source of truth for Overview averages, company brief, saved-question state, and canonical per-turn `TurnDetail`s.
- **`turnResults: ReplayTurnResult[]`** — local-only data the server never sees: object-URL replay blobs (`replayUrl`, `audioReplayUrl`), the analyzer's `cvSummary`, and the per-turn `analyzerDiagnostics`. Survives even when the refetch fails.
- **`replayToTurnDetail(replay, idx)`** — fallback adapter at module scope. Synthesizes a `TurnDetail` from a `ReplayTurnResult` so the Results panels always have something to render if polling/refetch fails. Used through the `effectiveTurns = sessionDetail ? sessionDetail.turns : turnResults.map(replayToTurnDetail)` pattern inside the `isDone` branch. While the session is still pending, Overview averages are derived from the currently available turn scores (`turnDetailAverages(effectiveTurns)`); once `status === "completed"`, persisted `sessionDetail.averages` takes over.

Pending evaluation is a first-class UI state. While `sessionDetail?.status !== "completed"`, null scores mean **"Scoring in progress"** and must render as pending copy, not as failed eval and not as blank final tiles. Only after the session is completed should a turn with null score fields render **"Evaluation failed"**. This avoids trapping the user on a long final-submit spinner while still making it clear that feedback is arriving progressively.

`PracticeLocationState` now carries `company` and `jobTitle` (echoed by `Home.tsx`) so the Overview's left column can identify the session without waiting on the refetch.

Two panel components under `components/practice/`:

- **`PracticeOverviewPanel.tsx`** — two-column shape matching SessionDetail's `OverviewPanel`. Left column: "Let's look at how you did" heading, company name + target role, editorial body paragraph. Right column: `<ScoresOverviewColumn averages caption={...} />` reused from `components/session-detail/OverviewPanel.tsx` (extracted as a named export for this purpose); the `caption` slot carries either the pending scoring message or the session-overall line ("Overall X/10 averaged across N of M turns"). SessionDetail's own usage omits the caption.
- **`PracticeTurnPanel.tsx`** — six inner cards in three rows × two columns at ≥900px; single column stack below.
  - **Row 1**: `<QuestionAnswerCard turn={turn} />` | `<VideoReplayCard replay={replay} />`. Row container has `min-[900px]:h-[clamp(22rem,30vw,28rem)]` so the video card never grows into a long empty rectangle when the transcript is short; long transcripts scroll inside the Q+A card's existing `flex-1 min-h-0 overflow-y-auto` region. **Don't drop this clamp** — without it, sibling-stretch + `aspect-video` interact badly and leave empty space below the video.
  - **Row 2**: composed `<InnerCard>` with `<MainTakeawaySection />` + `<QuickWinsSection />` | `<WhatWorkedCard turn={turn} />`. Natural height, items-stretch.
  - **Row 3**: `<ImprovementMomentsCard turn={turn} />` | `<ImproveNextCard replay={replay} />`. Natural height, items-stretch.

The first three turn-card pieces (`QuestionAnswerCard`, `WhatWorkedCard`, `ImprovementMomentsCard`) plus three section renderers (`ScoresSection`, `MainTakeawaySection`, `QuickWinsSection`) live in `components/session-detail/_turnInnerCards.tsx` — shared with SessionDetail's `TurnPanel`. The Practice-only `VideoReplayCard.tsx` and `ImproveNextCard.tsx` sit under `components/practice/`.

**`VideoReplayCard`** wraps the `<video>` element with a face-mesh toggle and download link. The `ReplayLandmarkOverlay` (face-landmark canvas) lives inside this file — Practice.tsx no longer owns any video-overlay code. The legacy "Show notes / coaching overlay" gradient on top of the video was deliberately removed: the main takeaway is already in Row 2's Takeaway card, so duplicating it on the video would just compete for attention.

**`ImproveNextCard`** is a thin renderer over the evaluator's answer-grounded feedback — no local coaching generation. Three omitted-when-absent blocks: (1) "What to fix first" from `feedback_detail.next_take` (`{focus, approach}`, produced by the backend coaching call); (2) "Keep this part" — a condensed forward reminder from the top `positive_moments` entry (omitted for non-answers, which have empty positives); (3) "Filler words" distribution chart (submit-time data, accurate even before scoring). Gated on `evaluationPending`/`evaluationFailed` (shared `EvalStatusNotice`): while pending/failed it shows the status notice + filler block only. The earlier client-side `PLAYBOOKS` / `questionKindFor` template machinery (question-kind regex + fill-in-the-blank scaffolds) was **retired** — coaching now comes from the LLM that saw the answer. Props: `{ turn, evaluationPending, evaluationFailed }` (no `cvSummary` — delivery coaching lives in Row 2's `DeliveryFeedbackSection`).

### SessionDetail folder-tab shell

`SessionDetail.tsx` at `/sessions/:id` is a folder-tab "case file" — one large dark-beige card (`bg-tertiary-200`) with three folder-shaped tabs (Overview, Turn 1, Turn 2) attached to its top edge, plus circular `←` / `→` chevron buttons in the desktop gutters. The compact header that used to live above the card (back-link, date eyebrow, company `<h1>`, stats tiles) was deliberately removed — the card IS the page; TopBar's History link covers back-navigation, and per-session metadata lives inside the Overview panel.

The orchestrator (`src/pages/SessionDetail.tsx`) is small: load session, hold `activeTabIndex`, compose the three pieces below, wire keyboard + swipe nav. **Tab reset on `sessionId` change** uses the React-19 "compare prop to tracked state during render" pattern (`useState` + render-time `if (sessionId !== trackedSessionId) { setTrackedSessionId(sessionId); setActiveTabIndex(0); }`) rather than a `useEffect` that calls `setActiveTabIndex(0)` — the latter trips `react-hooks/set-state-in-effect`.

Three extracted components plus a helper module, all under `src/components/session-detail/`:

- **`FolderTabs.tsx`** — exports `FolderTabs` (the strip) and `SideNavButton` (the chevron). Tabs are `<button>`s with `rounded-t-lg border border-b-0` and `-mb-px` overlap onto the card so there's no seam. Inactive: `bg-tertiary-200 text-text-muted` (same fill as card body — they read as one continuous folder piece). Active: `bg-accent text-accent-fg`. Full ARIA tabs pattern with `←`/`→`/`Home`/`End` keyboard nav via a ref array.
- **`OverviewPanel.tsx`** — split layout (1-col below 900px, 2-col above). Left side renders the company brief block from `session.summary` (omitting empty sections entirely — never "(none)" placeholders). Right side is six `ScoreTile`s in a `grid-cols-2 min-[900px]:grid-cols-3` grid; each tile's progress bar uses inline `style={{ background: SCORE_COLOR_MAP[key] }}` for the per-dimension hue.
- **`TurnPanel.tsx`** — four inner sub-cards in **two independent row grids**, NOT one grid with `grid-rows-2 auto-rows-fr`. The single-grid version was tried first and rejected: `auto-rows-fr` makes both rows match the height of the taller, which left enormous empty gutters under the top-row cards when bottom-row feedback was long. Two row grids each `grid-cols-2` let each row size to its own content while still equalizing within-row heights (grid default `items-stretch` + `InnerCard`'s `h-full`).
- **`_helpers.ts`** — `SCORE_KEYS`, `SCORE_COLOR_MAP`, `num()`, `turnAverage()`. `SCORE_COLOR_MAP` mirrors `History.tsx:DIMENSIONS` so the trend chart and the per-session score tiles share one color language. If you change one, change both.

**The leftmost-tab / card-corner alignment** is load-bearing. The `FolderTabs` strip lives **inside** the same flex column as the card body (NOT in the outer flex row containing the side-button gutters) so its left edge aligns with the card's left edge. The leftmost tab's `rounded-t-lg` provides the rounded top-left corner of the combined shape; the card itself carries `min-[900px]:rounded-tl-none` so its underlying squared corner is hidden beneath the tab. Move the strip outside the column and the active tab floats into the prev-side-button gutter; remove `rounded-tl-none` and the card's curve emerges from under the tab as a visual artifact. Both bugs were caught and fixed during iteration — don't re-introduce them.

**Sticky chevron buttons** use `items-start` on the gutter column + `position: sticky; top: 50vh; -translate-y-1/2` on the inner wrapper. `items-start` is the load-bearing choice: with `items-center` the button's natural layout position is the column's vertical middle, which on a long card sits hundreds of pixels BELOW the viewport. Sticky's `top: 50vh` constraint says "the element's top must be ≥ 50vh from viewport top" — a position below the constraint _satisfies_ it, so sticky never engages on first paint and the chevrons are invisible until the user scrolls down. With `items-start`, the natural position is at the column top (above the threshold = closer to viewport top, smaller y), which **violates** the constraint, so sticky engages immediately and pins the button at viewport middle from first render.

**Native `title` for the chevron hover hint** (not a custom tooltip pill). An earlier `<span role="tooltip">` inside the button with `group-hover:opacity-100` was tried and removed: the sticky wrapper applies `transform: translateY(-50%)`, which creates a new containing block for absolute descendants, and the tooltip's absolute positioning resolved against it in unexpected ways. Native `title` works regardless — paired with `aria-label` (canonical screen-reader text), it covers both audiences. Mobile drops the chevrons entirely.

**Mobile (<900px)** drops the folder tabs strip, the side chevrons, and the desktop two-column / 2×2 layouts. Each panel collapses to a single vertical stack. A small `"Overview · 1 of 3"`-style eyebrow at the top of the active panel labels the section. Tab navigation: horizontal swipe (`touchstart`/`touchend` with `|dx| > 60 && |dx| > 1.5·|dy|` thresholding so vertical scrolls don't accidentally page) plus a `FlowHoverButton` Previous/Next row at the bottom of each panel. The absent direction renders an invisible `flex-1` spacer so the visible button stays edge-aligned.

**Issue-type chip formatting**: `formatIssueType(raw)` is a generic snake_case → Title Case formatter local to `TurnPanel.tsx`. Don't hard-code a switch on the canonical 10 evaluator categories — the generic formatter is correct for unknown / legacy values too.

### Save & re-practice opening questions

Lets a user save up to 5 **opening** questions (never follow-ups) as frozen snapshots, re-practice them, and compare scores across attempts. Backend contract + the experience-level freeze live in `../CLAUDE.md`. Frontend pieces:

- **Wire types** in `src/types/savedQuestions.ts` (mirror the new Pydantic schemas; Decimal scores arrive as **strings** on the wire — coerce with `parseFloat` / the `num()` helper at the chart boundary). `src/types/history.ts` `SessionDetail` gained `saved_question_id: string | null`.
- **Hooks** follow the `useSessions` / `useSessionDetail` pattern (all network through `useApi().apiFetch`, gated on `isReady`): `useSavedQuestions()` (list + `refetch` + `save` / `remove` / `rePractice` mutators, `RePracticeResult` type) and `useSavedQuestionDetail(id)` (mirrors `useSessionDetail`, exposes `errorStatus`).
- **`SaveQuestionButton.tsx`** — shared 3-state button (**Save** / **Saved** disabled / **Full** disabled at 5/5), `lucide` `Bookmark` / `BookmarkCheck`. Props `sessionId` / `alreadySaved` / `evaluated`; uses `useSavedQuestions` for the cap + save. Mounted at **two points**, both on the **opening turn only** (`turn_number === 1 && !is_followup`): `components/session-detail/TurnPanel.tsx` and `components/practice/PracticeTurnPanel.tsx`. In Practice it is visible in Results but remains unevaluated/disabled until polling receives completed scores; saved-state comes from `sessionDetail.saved_question_id`.
- **History section** — `History.tsx` renders `SavedQuestionsSection` + `SavedQuestionRow` **above** "Sessions", hidden entirely when zero saved, with a full-width explanatory paragraph (snapshot semantics + 5-cap). Each row shows the frozen **`job_title`** (NOT live `target_role`), company, last-practiced, avg score, plus **Re-practice** (→ `POST /saved-questions/{id}/practice` then `navigate('/practice', { state })` reusing `PracticeLocationState`) and **Delete** (`Trash2`). Row click → `/saved-question/:id`.
- **`pages/SavedQuestionDetail.tsx`** at route `/saved-question/:id` (in `App.tsx` under `RequireAuth` + `RequireOnboarded`, same nesting as `/sessions/:id`). recharts `LineChart` mirroring `History.tsx` (reuses `DIMENSIONS` / `ToggleChip` / `num` / `--color-chart-*`): one **Overall** line plus the **opening-turn (turn-1) per-dimension** lines across attempts. **Overall is recomputed frontend-side as the mean of the plotted turn-1 dims** (`openingOverall()`, excludes nulls) — NOT the session's blended turns-1+2 `overall_score` — so the whole chart consistently represents the opening answer (an earlier mismatch where Overall blended both turns was fixed this way). Failed-eval attempts render an "Evaluation failed" marker and are **not plotted** (left off the line, never a 0 point). A full-width paragraph above the chart explains what the Progress chart tracks. All UI uses semantic tokens so dark mode flips for free.

## House style

- `MePing` is a deliberate debug widget rendering the `/me` JSON — leave it in during development, remove before demo.
- Components have header doc-comments explaining their role in the flow. Keep this style when adding new ones — the comments are terse but load-bearing for anyone joining mid-hackathon.

## Design system

Earth-tone editorial palette unified on **Inter** for all app/display/UI typography (Geist Mono reserved for code). Everything is wired through Tailwind 4's `@theme` block in `src/index.css` — **no `tailwind.config.js` exists, and none should be added**.

### Source of truth

`src/index.css` `@theme { ... }` is the single source of design tokens. Adding a new color, font, or radius means editing that block — never hand-type hex or `px` in components. Tailwind 4 auto-generates the matching utility (`--color-foo-500` → `bg-foo-500`, `text-foo-500`, `border-foo-500`; `--font-foo` → `font-foo`; `--radius-foo` → `rounded-foo`).

### Color system

Nine scales (`primary`, `secondary`, `tertiary`, `quaternary`, `quinary`, `senary`, `septenary`, `octonary`, `grey`), each with stops `100` → `700` (100 lightest, 700 darkest). All earth tones — beige, taupe, olive, warm near-black. No vibrant accents in the palette; `primary/700` (`#17150f`) is the brand "ink" used for buttons, links, and focus rings.

Base page background is `primary/100` (`#F1E9D2`), set globally on `:root`. Most UI should sit directly on this surface; elevate with `surface-raised` only when a card needs to distinguish itself.

### Token hierarchy (important)

**Prefer semantic tokens in component code.** Reach for the raw scale only when no semantic alias fits, and when that happens consider whether a new semantic alias should be added instead.

| Use case              | Semantic utility               | Resolves to       |
| --------------------- | ------------------------------ | ----------------- |
| Page background       | `bg-surface`                   | primary/100       |
| Card / elevated panel | `bg-surface-raised`            | tertiary/100      |
| Subtle well / input   | `bg-surface-sunken`            | quaternary/100    |
| Default border        | `border-border`                | primary/200       |
| Stronger border       | `border-border-strong`         | primary/300       |
| Body text             | `text-text`                    | primary/700       |
| Muted text            | `text-text-muted`              | primary/500       |
| Subtle / helper text  | `text-text-subtle`             | primary/400       |
| Primary button bg     | `bg-accent` + `text-accent-fg` | primary/700 + 100 |
| Primary button hover  | `hover:bg-accent-hover`        | primary/600       |
| Focus ring            | `ring-focus-ring`              | primary/700       |

If you find yourself writing `bg-primary-500` in a component, pause — is this really a one-off, or should `--color-something` be added to `@theme`?

### Typography

- `--font-sans` = **Inter** (variable, opsz 14–32). Default on `<body>`; inherits everywhere — don't apply `font-sans` explicitly.
- `--font-ui` = **Inter**. Semantic alias available for form / input / button typography if it ever needs to diverge from body.
- `--font-display` = **Inter**. Used by base `h1..h6` styling for headings.
- `--font-mono` = Geist Mono fallback. Reserved for code blocks; **not** currently `@import`ed — falls back to `ui-monospace, Consolas`. Add the import if a real mono usage lands.

All three app tokens (`--font-sans`, `--font-ui`, `--font-display`) resolve to Inter today. The three-token split is forward-looking: if one role needs to diverge later, swap a single token without a codebase-wide rename. Don't introduce a second face without a clear product reason.

The base `h1..h6` selectors in `index.css` already set `--font-display`, weight 500, tightened letter-spacing, and a responsive `clamp()` for h1/h2. Use semantic heading tags (`<h1>`, `<h2>`, `<h3>`) and let the CSS do the work — applying `font-display` / `font-sans` / `font-ui` in components is rarely needed since all three resolve to Inter.

The h1/h2 clamp upper bounds (`4.5rem` / `2.75rem`) are tuned to keep growing on wide monitors past where root-font scaling alone plateaus — see "Wide-monitor scaling" below for how the three mechanisms interact. Don't lower these caps without understanding the trade-off.

Inter loads from Google Fonts via `@import` in `index.css`. If offline-demo reliability matters, swap to `@fontsource/inter` — the token names don't change.

### Wide-monitor scaling

The system scales up on large external monitors via three coupled mechanisms. Touch all three together when changing anything that affects "how big does X feel on a 4K display":

1. **Root font-size media queries** in `index.css` step `:root { font-size }` from `16px` → `17px` at `≥1536px`, `18px` at `≥1920px`, `20px` at `≥2560px`. Because the entire system is rem-based (max-widths, padding, gaps, clamp bounds, line-heights), this single change scales every rem unit proportionally — that's why we don't need hundreds of per-component `2xl:` overrides. **Use rem or the semantic Tailwind size utilities (`text-xs` / `text-sm` / `text-base` / `text-lg` …) for any body or metadata text.** Hard-coded `text-[NNpx]` does NOT participate in scaling and will look tiny on a 1920+ display.
2. **`h1`/`h2` `clamp()` upper bounds** in the base styles (`4.5rem` / `2.75rem`) are tuned so headings continue growing past the root-font plateau. The `vw` term in the clamp does the work between root-font breakpoints; the upper cap stops it before it gets absurd.
3. **`2xl:max-w-[88rem]` (and `2xl:max-w-[92rem]` for the two larger Practice/SessionDetail layouts) on outer page containers**. Pattern is established on `Home`, `Hero`, the Practice phase containers, `History`, `SessionDetail`, and `FlashBanner`. Inner typographic max-widths (`max-w-[54rem]`, `max-w-[42rem]`, `max-w-[56ch]`) deliberately stay tight — they're line-length caps and should NOT grow with viewport (long lines hurt readability regardless of monitor size).

**Explicit exceptions** — these stay hard-coded in px on purpose, don't sweep them:

- `text-[10px] uppercase tracking-eyebrow` micro-labels (FlashBanner notice tag, error eyebrows, etc.) — intentional editorial chrome, meant to be tiny. (The old SessionDetail compact-header stat tiles also fell in this bucket and were removed entirely in the folder-tab redesign; `text-eyebrow` from `--text-eyebrow: 11px` covers most remaining cases.)

**Don't add content to fill empty space on wide monitors.** The brand position (`frontend/.impeccable.md`: "Empty space is content") is that the scaling pass exists to make existing content feel intentionally sized at 1920+, not to add density, sidebars, or marketing tiles.

### Radius

Default `--radius` is `12px`. Rounded, not sharp.

- `rounded` (12px) — inputs, buttons, and most controls
- `rounded-lg` (16px) — cards, modals
- `rounded-xl` (24px) — hero sections, marketing blocks
- `rounded-full` — avatars, pills, chips
- `rounded-sm` (8px) / `rounded-xs` (4px) — reserved for tight nested elements

Never `rounded-none` unless the design explicitly calls for a sharp edge.

### Focus states

Always visible. The pattern:

```tsx
className =
  "... focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
```

Do not remove `outline` without replacing it with a visible ring. Accessibility is not optional.

### Dark mode

Supported via a **class strategy on `<html>` + a curated token swap** (warm "espresso" dark — NOT an inversion of the cream light theme).

- **Mechanism (`index.css`).** A single `html.dark { … }` block overrides **only the semantic aliases + the six `--color-chart-N` series** (never the 9 raw scales). Because every utility and `:root { background: var(--color-surface) }` reads `var(...)`, redefining the aliases re-resolves the whole app — ~90% of surfaces flip for free (Hero, Home, TopBar, Practice Results, History incl. recharts, SessionDetail). Specificity note: `html.dark` (0,1,1) beats `@theme`'s `:root` (0,1,0), so the overrides win. `@custom-variant dark (&:where(.dark, .dark *))` is also declared so one-off `dark:` utilities are available if a component ever needs to diverge from the token flip. Dark contrast targets WCAG AA on `#16140F`.
- **No-flash init (`index.html`).** A blocking inline script sets the `dark` class before first paint. **First visit follows OS `prefers-color-scheme`; once the user toggles, their explicit `localStorage['theme']` choice wins forever.**
- **State + control.** `src/hooks/useTheme.ts` is a `useSyncExternalStore`-backed store whose snapshot is the `<html>` class (so no hydrate flash); `setTheme` keeps class + localStorage + subscribers in sync. `src/components/ThemeToggle.tsx` is the icon-only Sun/Moon button, mounted in `TopBar`'s right cluster (always visible, including signed-out Hero).
- **Manila "case file" exception.** The folder card + inactive folder tabs use the fixed raw scale `bg-tertiary-200` (light manila), kept light in dark mode by design. So `index.css` re-scopes the **text** tokens back to light-theme values for the `html.dark .bg-tertiary-200` subtree, then restores the dark palette's light text on the dark inset panels (`html.dark .bg-tertiary-200 .bg-surface-raised` — company brief, score tiles, turn `InnerCard`s). This is why text on the SessionDetail/Practice-Results card reads dark while the inner cards stay light-on-dark. The DRY `--dk-text*` helper vars exist so the restore matches the dark palette without re-stating hexes.
- **Clerk is theme-aware.** `main.tsx` wraps `ClerkProvider` in a `Root` component that reads `useTheme()` and builds `appearance` from light/dark `variables` (mirroring the espresso tokens) + `captcha.theme`; Clerk re-themes its mounted widgets (UserButton popover/avatar, SignUp `#clerk-captcha`) on toggle without a reload. `elements` is one shared object — its classes already resolve per-theme. The `.cl-*AvatarBox` overrides in `index.css` use **accent tokens** (not raw `primary` scale) so the avatar flips too. Note the SignIn/SignUp pages themselves are custom token-styled forms (not Clerk's prebuilt component), so they already flipped.
- **Known light-only gaps (deliberate, follow-up pass).** The gray/black tech-debt components (App.tsx, MePing.tsx, OnboardingForm.tsx, SignIn.tsx) use built-in Tailwind colors and won't fully adapt until migrated to semantic tokens. Calibration's camera box uses intentionally-dark raw scales and is correct in both themes.

### Tech debt

Existing components (`App.tsx`, `MePing.tsx`, `OnboardingForm.tsx`, `SignInPage.tsx`) still use built-in Tailwind grays/reds/black (`text-gray-500`, `bg-gray-100`, `border-red-200`, `bg-black text-white`). These render fine but don't match the palette. Migrate to semantic tokens in a follow-up pass — don't do it piecemeal while building new features or the repo will drift.

There are no error/success semantic tokens yet (`--color-danger`, `--color-success`). Add them to `@theme` when the first component actually needs one — don't invent them preemptively.

## Design Context

Mirrored from `frontend/.impeccable.md` — canonical version lives there. Keep in sync by hand when either changes.

### Users

**Primary**: Undergraduates preparing for internship and new-grad behavioral interviews. High-stakes, often anxious — first or second real interview, limited time, practicing in dorm rooms, library corners, and 30-minute gaps between classes. Usually alone, usually on a laptop. Often practicing the night before or the morning of.

**Job to be done**: Get focused reps on a specific company's behavioral round, hear themselves back, and leave with a concrete list of things to fix — without feeling patronized or drilled. Replaces "rambling to a friend over FaceTime."

**Secondary**: Recent grads running repeat sessions while job-hunting. Don't exclude them, but when in conflict, decisions lean to the undergrad context.

### Brand Personality

Three words: **premium, quiet, intentional**.

Deliberately counter-intuitive for an undergrad audience. Tools aimed at students usually shout (mascots, streaks, XP, exclamation marks). The thesis here is the opposite: **treat the student as an intelligent adult doing serious work**. Peers are Linear, Arc, Things 3 — expensive without being loud.

**Copy voice**:

- No exclamation marks. No "Let's do this!" No "You got this, champ."
- Plain, confident sentences. Short. Editorial cadence.
- Instructions before encouragement. If encouragement appears, it's earned by specifics ("Your STAR score climbed 2 points since last session"), not sprinkled.
- Banned words: "journey," "unlock," "level up," "streak," "gamify."

**Emotional goal at session end**: calm and clear-headed, as if leaving a quiet practice studio. Not pumped up, not drained. The interface is a room, not a trainer.

### Anti-references (the product must NOT feel like)

1. **Gamified cram apps** (Duolingo / Quizlet / Brilliant). No streaks, confetti, XP, mascots, achievement popups, celebratory animations, or progress bars that "fill up." Scores are data, not rewards.
2. **Leetcode-grind tools**. No dark UI, no timer in the corner, no dense stat panels treating prep as attrition. The session is focused practice, not a workout.

Also avoid: Calm/Headspace pastel softness (saccharine), and generic SaaS dashboard chrome (sidebar + top bar + identical cards).

### Current focus: the hero / landing page

The hero is the current design priority. Treat it as the entry point to a voice-based practice session — not a marketing page full of feature tiles, and not a dashboard.

**What the hero must do**:

1. Signal in under three seconds that this is serious, calm, and for an adult.
2. Explain in one sentence what a session actually is (voice practice with feedback).
3. Offer one clear primary action — start a session — with a company input near it. No multi-step funnel.
4. Work for both signed-out (needs trust-building copy) and signed-in (already onboarded, should see the "start" affordance first).

**Hero design principles**:

- **Typography carries the emotional load.** Inter at confident display size (clamp up to ~3.5rem) and weight 500 on a cream page does more than any illustration or gradient could. Resist hero images, mesh gradients, 3D objects, animated blobs.
- **One action, alone on the surface.** Primary CTA sits in its own negative space with nothing competing. Secondary affordances (sign in, history, about) are quieter — text links or ghost buttons, not duplicate primaries.
- **Copy is the decoration.** A well-written subheading replaces a decorative element. Write copy first, lay it out second.
- **Asymmetric, not centered.** Left-aligned long-form hero text with an asymmetric action block reads more designed than the centered hero template.
- **Empty space is content.** At least half the hero should be cream and breathing. Don't fill it because it "looks empty" — it's doing the work.

### Design principles (apply to every decision)

1. **Studio, not cram.** Every surface feels like a calm workspace. When in doubt, remove chrome before adding it.
2. **Adult vocabulary.** Write copy as if addressing a peer who is smart but pressed for time. Cut hype. Cut exclamation marks. Cut any sentence that could live in a Duolingo push notification.
3. **Restraint signals premium.** The premium cue comes from what isn't there — no gradient cards, no stat counters, no decorative illustrations, no animated mascots. Confident typography + precise spacing + accurate color is the whole brand.
4. **One primary action per surface.** Competing CTAs dilute confidence. If a page has two "equally important" actions, the design is wrong — find the hierarchy and commit.
5. **Metrics are data, not rewards.** The five evaluator scores (directness, STAR, specificity, impact, conciseness) are shown clearly, without celebration. No "Great job!", no animated fills, no green checkmarks on improvement.
