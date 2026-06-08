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

```
VITE_API_URL=http://localhost:8000        # defaulted in lib/api.ts; override for deployed backend
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...    # throws in main.tsx if missing
```

## Stack notes (non-obvious versions)

- **React 19** + **Vite 8** + **TypeScript ~6** + **Tailwind 4** via `@tailwindcss/vite` (config-less — no `tailwind.config.js`, no PostCSS pipeline).
- **Clerk SDK is `@clerk/react`** (not `@clerk/clerk-react`). Use `<Show when="signed-in">` for gating and `useAuth().getToken()` for JWTs. Don't paste old-SDK snippets.

## Architecture

### Auth + API seam (load-bearing — don't bypass)

1. **`src/lib/api.ts`** — context-free. Owns `BASE_URL`, `buildUrl(path)`, `ApiError`. Safe to import anywhere.
2. **`src/hooks/useApi.ts`** — React-context fetcher. `useApi()` → `{ apiFetch, isReady }`. `apiFetch` attaches Clerk `getToken()` Bearer and throws `ApiError` on non-2xx. Gate requests on `isReady` (Clerk's `isLoaded`).
3. **`src/hooks/useMe.ts`** — single source of truth for the current user row. `App.tsx`, `OnboardingForm`, `MePing` consume it — don't re-fetch `/api/v1/me` elsewhere.

**All API calls go through `useApi().apiFetch`** — never raw `fetch()` (skips auth + shared error shape).

For displaying errors, prefer `extractApiErrorDetail(err)` over `err.message` (the latter contains raw JSON for debugging). `Practice.tsx` maps moderation 422 → "This violates the usage policy. Please re-record and try again."

**FormData quirk**: `useApi` omits `Content-Type` for `FormData` bodies (browser sets the multipart boundary). Setting `application/json` breaks multipart parsing server-side.

### App shell

`main.tsx` wraps `<App />` in `<ClerkProvider>` → `<BrowserRouter>` (react-router v7). `App.tsx` is a route table; auth/onboarding gates in `route-guards.tsx` (`RequireAuth`, `RequireOnboarded`, `RedirectIfOnboarded`) compose via nested layout routes. `/` is the only auth-bivalent route (`HomeRoute`): signed-out → `<Hero />`; signed-in → `<Navigate to="/onboarding" />` (not onboarded) or `<Home />`. Full route table + Setup→Practice handoff in `../CLAUDE.md` "Frontend Routing".

### Type contract with backend

`src/types/` manually mirrors `backend/app/schemas/` — **no codegen**. When a Pydantic schema changes, update the matching type by hand (and vice versa). Backend is `../backend` (sibling dir, not submodule) — read it for canonical shapes. Decimal scores arrive as **strings** on the wire — coerce with `parseFloat`/`num()`.

Same hand-mirror discipline applies to `src/lib/contentPolicy.ts` — it mirrors the prompt-injection regex in `backend/app/services/_injection.py` (`CONTENT_INJECTION_RE`) for instant client-side validation of the bio + pasted-résumé fields (`OnboardingForm`, `Personalize`). The backend re-checks authoritatively (and is the only place PDF-extracted résumé text is inspected); keep the two patterns in sync.

### Routes wired (each behind a `useMe`-pattern hook — never inline `apiFetch` in components)

`/me` + `/me/stats` (`useMe`), `/onboarding` (`OnboardingForm`), `/sessions` family (`useSessions`/`useSessionDetail`), `/saved-questions` family (`useSavedQuestions`/`useSavedQuestionDetail`), `/validation/industries` + `/validation/roles` (onboarding/Personalize comboboxes).

### Practice Interview phase shell

Interview half of `Practice.tsx` is **chrome-free, full-viewport** (TopBar gated by `{isDone && …}`, renders only in Results). `flex h-screen flex-col` with two children:

1. **Body grid** — desktop `min-[900px]:grid`, `grid-template-columns` flips `[33%_67%]` (transcript closed) ↔ `[25%_50%_25%]` (open). Mobile → vertical `flex flex-col`. Columns under `components/practice/`:
   - **`QuestionColumn.tsx`** — eyebrow + invisible-underlay question text + `<audio>`. Sole consumer of `replayKey` (audio remounts to retrigger `autoPlay` on Re-record / footer Restart-turn). `min-[900px]:border-r`.
   - **`CameraColumn.tsx`** — 16:9 box at **fixed `w-[45vw]` desktop** / `w-full` mobile. The 45vw lock is load-bearing: camera width never changes when transcript opens (grid columns flex around the box). Renders `<CameraPreview>` (`videoStream != null`), recorded video (`showPreview`), or dark `bg-accent` placeholder with state-aware copy. Submit/Re-record below, disabled while `submitting`.
   - **`TranscriptColumn.tsx`** — `min-[900px]:border-l` / `border-t` mobile. X close hidden on mobile (footer toggles).
2. **`PracticeFooter.tsx`** — sticky bottom bar (`h-20 shrink-0 border-t bg-surface-raised`). Left: "Turn N" + recording-state pill. Right: five icon+label buttons (End recording / Restart turn / Show-hide question / Show-hide transcript / Quit). `FooterButton` hides text via `min-[900px]:inline` (mobile = icon-only). End-recording overrides neutral defaults via className (twMerge resolves). During `submitting`, right row → inline spinner. Big-red Quit is a separate `QuitButton` helper.

**`QuitConfirmDialog.tsx`** — sibling of body+footer; owns its ESC effect (only while `open`), backdrop click → `onCancel`, inner card stops propagation.

Old `RecordingStatusPill` (+ `getAnalyzerStatusLabel`/`Class`) removed; recording state surfaced only by footer pill. `analyzer.diagnostics` still consumed by `handleSubmitTurn` for `cv_summary`, not by UI.

### Practice Results phase shell

When `isDone === true`, `Practice.tsx` renders a folder-tab "case file" shell mirroring `SessionDetail.tsx` (same `FolderTabs` + circular `SideNavButton` chevrons, `sticky top-[50vh] -translate-y-1/2` + `items-start`, mobile swipe + Prev/Next `FlowHoverButton`, `anim-crossfade` panels). TopBar covers post-session nav.

Data flow:

- **`sessionDetail: SessionDetail | null`** — from polling `GET /sessions/{id}` after final turn. Final POST does **not** wait for scoring; Results enters immediately, polls ~2s until `status === "completed"`. Then it's the source of truth for Overview averages, brief, saved-question state, per-turn `TurnDetail`s.
- **`turnResults: ReplayTurnResult[]`** — local-only (object-URL replay blobs `replayUrl`/`audioReplayUrl`, `cvSummary`, `analyzerDiagnostics`). Survives refetch failure.
- **`replayToTurnDetail(replay, idx)`** — module-scope fallback adapter. Used via `effectiveTurns = sessionDetail ? sessionDetail.turns : turnResults.map(replayToTurnDetail)`. While pending, Overview averages from `turnDetailAverages(effectiveTurns)`; once completed, persisted `sessionDetail.averages` takes over.

**Pending eval is a first-class UI state.** While `status !== "completed"`, null scores = **"Scoring in progress"** (not failed, not blank). Only after completed do null scores = **"Evaluation failed"**.

`PracticeLocationState` carries `company` + `jobTitle` (echoed by `Home.tsx`) so Overview identifies the session before refetch.

Panel components under `components/practice/`:

- **`PracticeOverviewPanel.tsx`** — two-column matching SessionDetail's `OverviewPanel`. Right column reuses `<ScoresOverviewColumn averages caption={...} />` (named export from `components/session-detail/OverviewPanel.tsx`); `caption` carries pending message or overall line.
- **`PracticeTurnPanel.tsx`** — six inner cards, 3 rows × 2 cols at ≥900px; single stack below.
  - **Row 1**: `<QuestionAnswerCard>` | `<VideoReplayCard>`. Container has `min-[900px]:h-[clamp(22rem,30vw,28rem)]` — **don't drop this clamp** (without it sibling-stretch + `aspect-video` leave empty space below video). Long transcripts scroll in Q+A card's `flex-1 min-h-0 overflow-y-auto`.
  - **Row 2**: `<InnerCard>` w/ `<MainTakeawaySection>` + `<QuickWinsSection>` | `<WhatWorkedCard>`.
  - **Row 3**: `<ImprovementMomentsCard>` | `<ImproveNextCard>`.

`QuestionAnswerCard`, `WhatWorkedCard`, `ImprovementMomentsCard` + section renderers (`ScoresSection`, `MainTakeawaySection`, `QuickWinsSection`) live in `components/session-detail/_turnInnerCards.tsx` (shared w/ SessionDetail). Practice-only `VideoReplayCard.tsx` + `ImproveNextCard.tsx` under `components/practice/`.

**`VideoReplayCard`** — `<video>` + face-mesh toggle + download. Owns `ReplayLandmarkOverlay` (face-landmark canvas). Legacy "coaching overlay" gradient removed (takeaway already in Row 2).

**`ImproveNextCard`** — thin renderer over evaluator's answer-grounded feedback (no local coaching gen). Three omitted-when-absent blocks: (1) "What to fix first" from `feedback_detail.next_take` `{focus, approach}`; (2) "Keep this part" from top `positive_moments` (omitted for non-answers); (3) "Filler words" chart (submit-time data, accurate pre-scoring). Gated on `evaluationPending`/`evaluationFailed` (`EvalStatusNotice`): while pending/failed shows status + filler block only. Old client-side `PLAYBOOKS`/`questionKindFor` machinery **retired**. Props `{ turn, evaluationPending, evaluationFailed }` (no `cvSummary`).

### SessionDetail folder-tab shell

`SessionDetail.tsx` at `/sessions/:id` — folder-tab "case file": one dark-beige card (`bg-tertiary-200`) with three folder tabs (Overview, Turn 1, Turn 2) on its top edge + circular `←`/`→` chevrons in desktop gutters. Old compact header (back-link, date, company h1, stat tiles) removed — the card IS the page; metadata lives in Overview.

Orchestrator (`src/pages/SessionDetail.tsx`) is small: load session, hold `activeTabIndex`, compose pieces, wire keyboard + swipe. **Tab reset on `sessionId` change** uses React-19 "compare-prop-to-tracked-state-during-render" (`useState` + render-time `if (sessionId !== trackedSessionId) {...}`), NOT a `useEffect` setState (trips `react-hooks/set-state-in-effect`).

Components under `src/components/session-detail/`:

- **`FolderTabs.tsx`** — exports `FolderTabs` (strip) + `SideNavButton` (chevron). Tabs `<button>` w/ `rounded-t-lg border border-b-0` + `-mb-px` overlap (no seam). Inactive `bg-tertiary-200 text-text-muted` (reads as one folder piece); active `bg-accent text-accent-fg`. Full ARIA tabs pattern (`←`/`→`/`Home`/`End` via ref array).
- **`OverviewPanel.tsx`** — split (1-col <900px, 2-col above). Left: company brief from `session.summary` (omit empty sections — never "(none)"). Right: six `ScoreTile`s in `grid-cols-2 min-[900px]:grid-cols-3`; bar uses inline `style={{ background: SCORE_COLOR_MAP[key] }}`.
- **`TurnPanel.tsx`** — four sub-cards in **two independent row grids** (NOT one grid w/ `auto-rows-fr` — that matched both rows to the taller, leaving empty gutters). Two `grid-cols-2` rows each size to own content, equalize within-row via `items-stretch` + `InnerCard` `h-full`.
- **`_helpers.ts`** — `SCORE_KEYS`, `SCORE_COLOR_MAP`, `num()`, `turnAverage()`. `SCORE_COLOR_MAP` mirrors `History.tsx:DIMENSIONS` — change one, change both.

**Load-bearing layout facts** (caught/fixed during iteration — don't re-introduce):

- **Tab/corner alignment**: `FolderTabs` strip lives **inside** the card's flex column (not the outer gutter row) so its left edge aligns. Leftmost tab's `rounded-t-lg` is the combined shape's top-left corner; card carries `min-[900px]:rounded-tl-none` to hide its own squared corner. Move the strip out → active tab floats into the gutter; drop `rounded-tl-none` → card curve emerges as artifact.
- **Sticky chevrons**: `items-start` on gutter column + `sticky; top: 50vh; -translate-y-1/2` on wrapper. `items-start` is load-bearing: with `items-center` the natural position is the column middle (far below viewport on a long card), which satisfies `top:50vh` so sticky never engages until scroll. `items-start` puts it above the threshold → violates constraint → sticky pins at viewport middle from first paint.
- **Native `title`** for chevron hover (not a custom tooltip pill — the sticky wrapper's `translateY(-50%)` creates a containing block that broke absolute tooltip positioning). Paired w/ `aria-label`. Mobile drops chevrons.

**Mobile (<900px)**: drops folder strip, chevrons, 2-col/2×2 layouts → single vertical stack. `"Overview · 1 of 3"` eyebrow labels the panel. Nav: horizontal swipe (`touchstart`/`touchend`, `|dx|>60 && |dx|>1.5·|dy|`) + bottom `FlowHoverButton` Prev/Next row (absent direction → invisible `flex-1` spacer).

**Issue-type chips**: `formatIssueType(raw)` — generic snake_case → Title Case (local to `TurnPanel.tsx`). Don't hard-code a switch on the 10 categories (generic handles unknown/legacy too).

### Save & re-practice opening questions

Save up to 5 **opening** questions (never follow-ups) as frozen snapshots, re-practice, compare scores across attempts. Backend contract + experience-level freeze in `../CLAUDE.md`. Frontend:

- **Types** in `src/types/savedQuestions.ts`; `src/types/history.ts` `SessionDetail` gained `saved_question_id: string | null`.
- **Hooks** (`useSessions`/`useSessionDetail` pattern, all via `apiFetch`, gated on `isReady`): `useSavedQuestions()` (list + `refetch` + `save`/`remove`/`rePractice`, `RePracticeResult`) and `useSavedQuestionDetail(id)` (exposes `errorStatus`).
- **`SaveQuestionButton.tsx`** — shared 3-state button (Save / Saved disabled / Full disabled at 5/5), `lucide` `Bookmark`/`BookmarkCheck`. Props `sessionId`/`alreadySaved`/`evaluated`. Mounted at two points, **opening turn only** (`turn_number === 1 && !is_followup`): `session-detail/TurnPanel.tsx` + `practice/PracticeTurnPanel.tsx`. In Practice it's visible but disabled until polling gets completed scores; saved-state from `sessionDetail.saved_question_id`.
- **History section** — `History.tsx` renders `SavedQuestionsSection` + `SavedQuestionRow` **above** "Sessions", hidden when zero. Each row: frozen **`job_title`** (NOT live `target_role`), company, last-practiced, avg score, **Re-practice** (→ `POST /saved-questions/{id}/practice` then `navigate('/practice', {state})` reusing `PracticeLocationState`) + **Delete** (`Trash2`). Row click → `/saved-question/:id`.
- **`pages/SavedQuestionDetail.tsx`** at `/saved-question/:id` (under `RequireAuth` + `RequireOnboarded`). recharts `LineChart` (reuses `DIMENSIONS`/`ToggleChip`/`num`/`--color-chart-*`): one **Overall** line + **turn-1 per-dimension** lines across attempts. **Overall recomputed frontend-side as mean of plotted turn-1 dims** (`openingOverall()`, excludes nulls) — NOT session blended `overall_score` (fixes an earlier turn-1-vs-blended mismatch). Failed-eval attempts get a marker, **not plotted** (never a 0 point). Semantic tokens → free dark mode.

## House style

- `MePing` is a deliberate debug widget rendering `/me` JSON — leave during dev, remove before demo.
- Components have terse header doc-comments explaining their role in the flow — keep this style for new ones.

## Design system

Earth-tone editorial palette on **Inter** (Geist Mono reserved for code). Wired through Tailwind 4's `@theme` block in `src/index.css` — **no `tailwind.config.js`, and none should be added**.

### Source of truth

`src/index.css` `@theme { ... }` is the single source of design tokens — never hand-type hex/`px` in components. Tailwind 4 auto-generates utilities (`--color-foo-500` → `bg-/text-/border-foo-500`; `--font-foo` → `font-foo`; `--radius-foo` → `rounded-foo`).

### Color system

Nine scales (`primary`, `secondary`, `tertiary`, `quaternary`, `quinary`, `senary`, `septenary`, `octonary`, `grey`), stops `100`(lightest)→`700`(darkest). All earth tones; no vibrant accents. `primary/700` (`#17150f`) is brand "ink" (buttons, links, focus rings). Page bg `primary/100` (`#F1E9D2`) on `:root`. Elevate with `surface-raised` only when a card must distinguish itself.

### Token hierarchy — **prefer semantic tokens**; reach for raw scale only when no alias fits (and consider adding one).

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
| Primary button        | `bg-accent` + `text-accent-fg` | primary/700 + 100 |
| Primary button hover  | `hover:bg-accent-hover`        | primary/600       |
| Focus ring            | `ring-focus-ring`              | primary/700       |

If you write `bg-primary-500` in a component, pause — one-off, or should `--color-something` be added to `@theme`?

### Typography

- `--font-sans` / `--font-ui` / `--font-display` all = **Inter** today. Three-token split is forward-looking — swap one token if a role needs to diverge, don't introduce a second face without a product reason.
- Default on `<body>`, inherits everywhere — don't apply `font-sans` explicitly. Base `h1..h6` already set `--font-display`, weight 500, tight letter-spacing, responsive `clamp()` (h1/h2). Use semantic heading tags and let CSS work.
- h1/h2 clamp upper bounds (`4.5rem`/`2.75rem`) tuned to keep growing on wide monitors — don't lower without reading "Wide-monitor scaling".
- `--font-mono` = Geist Mono fallback (not `@import`ed; falls back to `ui-monospace, Consolas`). Inter loads via Google Fonts `@import`; for offline-demo reliability swap to `@fontsource/inter` (token names unchanged).

### Wide-monitor scaling — three coupled mechanisms, touch all three together:

1. **Root font-size media queries**: `:root { font-size }` 16→17px (≥1536), 18px (≥1920), 20px (≥2560). System is rem-based so this scales everything — **use rem / semantic size utilities (`text-sm`/`text-base`/…) for body text; hard-coded `text-[NNpx]` doesn't scale** and looks tiny at 1920+.
2. **h1/h2 `clamp()` upper bounds** (`4.5rem`/`2.75rem`) — the `vw` term grows between root-font breakpoints, the cap stops it.
3. **`2xl:max-w-[88rem]`** (`92rem` for the larger Practice/SessionDetail layouts) on outer containers. Inner typographic max-widths (`54rem`/`42rem`/`56ch`) stay tight — line-length caps, should NOT grow with viewport.

**Explicit exceptions** (stay hard-coded px — don't sweep): `text-[10px] uppercase tracking-eyebrow` micro-labels (editorial chrome, meant tiny; `text-eyebrow` = `--text-eyebrow: 11px` covers most).

**Don't add content to fill empty space on wide monitors** (`frontend/.impeccable.md`: "Empty space is content"). Scaling makes existing content feel intentionally sized — not to add density/sidebars/tiles.

### Radius

Default `--radius` = `12px`. Rounded, not sharp. `rounded`(12, controls) · `rounded-lg`(16, cards/modals) · `rounded-xl`(24, hero/marketing) · `rounded-full`(pills/avatars) · `rounded-sm`(8)/`rounded-xs`(4, tight nested). Never `rounded-none` unless explicitly called for.

### Focus states

Always visible: `focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. Don't remove `outline` without a visible ring replacement.

### Dark mode

Class strategy on `<html>` + curated token swap (warm "espresso", NOT an inversion).

- **Mechanism**: single `html.dark { … }` block overrides **only the semantic aliases + six `--color-chart-N`** (never the 9 raw scales). Everything reads `var(...)` so ~90% flips for free. Specificity: `html.dark` (0,1,1) beats `@theme`'s `:root` (0,1,0). `@custom-variant dark (&:where(.dark, .dark *))` declared for one-off `dark:` utilities. Targets WCAG AA on `#16140F`.
- **No-flash init (`index.html`)**: blocking inline script sets `dark` class before first paint. First visit follows OS `prefers-color-scheme`; once toggled, `localStorage['theme']` wins forever.
- **State**: `src/hooks/useTheme.ts` — `useSyncExternalStore` whose snapshot is the `<html>` class (no hydrate flash); `setTheme` syncs class + localStorage + subscribers. `ThemeToggle.tsx` Sun/Moon button in `TopBar` (always visible, incl. signed-out Hero).
- **Manila "case file" exception**: folder card + inactive tabs use fixed `bg-tertiary-200` (kept light in dark mode). `index.css` re-scopes **text** tokens to light values for `html.dark .bg-tertiary-200`, then restores dark-palette light text on dark inset panels (`html.dark .bg-tertiary-200 .bg-surface-raised`). DRY `--dk-text*` helper vars match the dark palette without re-stating hexes.
- **Clerk is theme-aware**: `main.tsx` wraps `ClerkProvider` in a `Root` reading `useTheme()`, builds `appearance` from light/dark `variables` + `captcha.theme`. `elements` is one shared object (classes resolve per-theme). `.cl-*AvatarBox` overrides use **accent tokens** so the avatar flips. SignIn/SignUp are custom token-styled forms (already flip).
- **Known light-only gaps (deliberate)**: gray/black tech-debt components (`App.tsx`, `MePing.tsx`, `OnboardingForm.tsx`, `SignIn.tsx`) won't fully adapt until migrated to semantic tokens. Calibration camera box uses intentionally-dark raw scales (correct in both themes).

### Tech debt

`App.tsx`, `MePing.tsx`, `OnboardingForm.tsx`, `SignInPage.tsx` still use built-in Tailwind grays/reds/black. Render fine but off-palette — migrate to semantic tokens in a follow-up pass, not piecemeal (avoids drift). No `--color-danger`/`--color-success` tokens yet — add to `@theme` when the first component needs one, don't invent preemptively.

## Design Context

Mirrored from `frontend/.impeccable.md` (canonical) — keep in sync by hand.

**Users** — Primary: undergrads prepping internship/new-grad behavioral interviews. Secondary: recent grads doing repeat sessions. When in conflict, lean undergrad.

**Current focus: hero / landing page.** The entry point to a voice practice session — not a marketing page or dashboard. Must: (1) signal in <3s this is serious, calm, adult; (2) explain in one sentence what a session is (voice practice with feedback); (3) one clear primary action — start a session — with a company input near it, no funnel; (4) work signed-out (trust copy) and signed-in (start affordance first).

**Hero principles**: typography carries the emotional load (Inter ~3.5rem clamp, weight 500 on cream — resist hero images/gradients/3D/blobs); one action alone in negative space (secondary affordances quieter); copy is the decoration; asymmetric left-aligned, not centered; empty space is content (≥half cream and breathing).

**Design principles (every decision)**: (1) Studio, not cram — remove chrome before adding. (2) Adult vocabulary — cut hype, exclamation marks, Duolingo-tone. (3) Restraint signals premium — no gradient cards/stat counters/illustrations/mascots; typography + spacing + color is the brand. (4) One primary action per surface — find the hierarchy and commit. (5) Metrics are data, not rewards — show the five scores clearly, no celebration/animated fills/green checkmarks.
