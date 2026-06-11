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
2. **`src/hooks/useApi.ts`** — `useApi()` → `{ apiFetch, isReady }`. Attaches Clerk `getToken()` Bearer, throws `ApiError` on non-2xx. Gate requests on `isReady`.
3. **`src/hooks/useMe.ts`** — single source of truth for current user row. Don't re-fetch `/api/v1/me` elsewhere.

**All API calls go through `useApi().apiFetch`** — never raw `fetch()` (skips auth + shared error shape). Prefer `extractApiErrorDetail(err)` over `err.message` for displaying errors.

**FormData quirk**: `useApi` omits `Content-Type` for `FormData` bodies (browser sets multipart boundary). Setting `application/json` breaks multipart parsing server-side.

### App shell

`main.tsx` wraps `<App />` in `<ClerkProvider>` → `<BrowserRouter>` (react-router v7). `App.tsx` is a route table; auth/onboarding gates in `route-guards.tsx`. Full route table + Setup→Practice handoff in `../CLAUDE.md` "Frontend Routing".

### Type contract with backend

`src/types/` manually mirrors `backend/app/schemas/` — **no codegen**. Update matching type by hand when Pydantic schema changes. Decimal scores arrive as **strings** on the wire — coerce with `parseFloat`/`num()`.

`src/lib/contentPolicy.ts` mirrors the prompt-injection regex in `backend/app/services/_injection.py` (`CONTENT_INJECTION_RE`) for instant client-side validation of bio + pasted-résumé. Backend re-checks authoritatively (and is the only place PDF-extracted résumé text is inspected); keep the two patterns in sync.

### Practice Interview phase shell

Interview half of `Practice.tsx` is **chrome-free, full-viewport** (TopBar gated by `{isDone && …}`). `flex h-screen flex-col` with two children:

1. **Body grid** — desktop `min-[900px]:grid`, `grid-template-columns` flips `[33%_67%]` (transcript closed) ↔ `[25%_50%_25%]` (open). Mobile → vertical `flex flex-col`. Columns under `components/practice/`:
   - **`QuestionColumn.tsx`** — question text + `<audio>`. Sole consumer of `replayKey` (audio remounts to retrigger `autoPlay` on Re-record / footer Restart-turn).
   - **`CameraColumn.tsx`** — 16:9 box at **fixed `w-[45vw]` desktop** / `w-full` mobile. The 45vw lock is load-bearing: camera width never changes when transcript opens (grid columns flex around the box). Submit/Re-record below, disabled while `submitting`.
   - **`TranscriptColumn.tsx`** — `min-[900px]:border-l` / `border-t` mobile. X close hidden on mobile (footer toggles).
2. **`PracticeFooter.tsx`** — sticky bottom bar. End recording / Restart turn / Show-hide question / Show-hide transcript / Quit. `FooterButton` hides text via `min-[900px]:inline` (mobile = icon-only).

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
- **`_helpers.ts`** — `SCORE_KEYS`, `SCORE_COLOR_MAP`, `num()`, `turnAverage()`. `SCORE_COLOR_MAP` mirrors `History.tsx:DIMENSIONS` — change one, change both.

**Load-bearing layout facts** (caught/fixed during iteration — don't re-introduce):

- **Tab/corner alignment**: `FolderTabs` strip lives **inside** the card's flex column (not the outer gutter row). Card carries `min-[900px]:rounded-tl-none`. Moving the strip out → active tab floats into gutter; dropping `rounded-tl-none` → card curve artifact.
- **Sticky chevrons**: `items-start` on gutter column + `sticky; top: 50vh; -translate-y-1/2` on wrapper. `items-start` is load-bearing: `items-center` puts natural position at column middle (far below viewport), satisfying `top:50vh` so sticky never engages. `items-start` puts it above threshold → sticky pins at viewport middle from first paint.
- **Native `title`** for chevron hover (not custom tooltip — sticky wrapper's `translateY(-50%)` creates a containing block that broke absolute tooltip positioning).

**Mobile (<900px)**: drops folder strip, chevrons, 2-col layouts → single vertical stack. Nav: horizontal swipe (`|dx|>60 && |dx|>1.5·|dy|`) + bottom Prev/Next row.

**Issue-type chips**: `formatIssueType(raw)` — generic snake_case → Title Case. Don't hard-code a switch (generic handles unknown/legacy).

### Save & re-practice opening questions

- **Types** in `src/types/savedQuestions.ts`; `SessionDetail` gained `saved_question_id: string | null`.
- **Hooks**: `useSavedQuestions()` (list + `save`/`remove`/`rePractice`) and `useSavedQuestionDetail(id)` (exposes `errorStatus`).
- **`SaveQuestionButton.tsx`** — 3-state (Save / Saved disabled / Full disabled at 5/5). Mounted **opening turn only** (`turn_number === 1 && !is_followup`) in `TurnPanel.tsx` + `PracticeTurnPanel.tsx`. In Practice, visible but disabled until polling gets completed scores.
- **History section** — `SavedQuestionsSection` above "Sessions", hidden when zero. Re-practice → `POST /saved-questions/{id}/practice` → `navigate('/practice', {state})`. Row click → `/saved-question/:id`.
- **`pages/SavedQuestionDetail.tsx`** — recharts `LineChart`: Overall + per-dimension lines across attempts. **Overall recomputed frontend-side as mean of turn-1 dims** (`openingOverall()`) — NOT session blended `overall_score` (fixes turn-1-vs-blended mismatch). Failed-eval attempts get a marker, **not plotted** (never a 0 point).

## House style

- `MePing` is a deliberate debug widget rendering `/me` JSON — leave during dev, remove before demo.
- Components have terse header doc-comments explaining their role in the flow — keep this style for new ones.

## Design system

Earth-tone editorial palette on **Inter** (Geist Mono reserved for code). Wired through Tailwind 4's `@theme` block in `src/index.css` — **no `tailwind.config.js`, and none should be added**.

`src/index.css` `@theme { ... }` is the single source of design tokens — never hand-type hex/`px` in components.

### Color system

Nine scales (`primary`…`grey`), stops `100`(lightest)→`700`(darkest). All earth tones. `primary/700` (`#17150f`) is brand "ink". Page bg `primary/100` (`#F1E9D2`).

### Token hierarchy — prefer semantic tokens; reach for raw scale only when no alias fits.

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

### Typography

- `--font-sans`/`--font-ui`/`--font-display` all = **Inter** today. Three-token split is forward-looking — swap one if a role diverges.
- Base `h1..h6` set `--font-display`, weight 500, tight letter-spacing, responsive `clamp()`. h1/h2 clamp upper bounds (`4.5rem`/`2.75rem`) tuned for wide monitors — don't lower.
- `--font-mono` = Geist Mono (not `@import`ed; falls back to `ui-monospace`). For offline-demo reliability swap to `@fontsource/inter` (token names unchanged).

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

Class strategy on `<html>` + curated token swap (warm "espresso", NOT an inversion).

- **Mechanism**: `html.dark { … }` overrides **only semantic aliases + six `--color-chart-N`**. Specificity: `html.dark` (0,1,1) beats `@theme`'s `:root` (0,1,0). `@custom-variant dark (&:where(.dark, .dark *))` for one-off `dark:` utilities.
- **No-flash init (`index.html`)**: blocking inline script sets `dark` class before first paint. First visit follows OS `prefers-color-scheme`; then `localStorage['theme']` wins.
- **State**: `src/hooks/useTheme.ts` — `useSyncExternalStore` whose snapshot is the `<html>` class. `ThemeToggle.tsx` in TopBar (always visible).
- **Manila "case file" exception**: folder card + inactive tabs use fixed `bg-tertiary-200` (light in dark mode). `index.css` re-scopes text tokens to light values for `html.dark .bg-tertiary-200`, then restores dark-palette light text on dark inset panels.
- **Clerk is theme-aware**: `main.tsx` wraps `ClerkProvider` in a `Root` reading `useTheme()`, builds `appearance` from light/dark `variables`.
- **Known light-only gaps (deliberate)**: `App.tsx`, `MePing.tsx`, `OnboardingForm.tsx`, `SignIn.tsx` won't fully adapt until migrated to semantic tokens. Calibration camera box uses intentionally-dark raw scales (correct in both themes).

### Tech debt

`App.tsx`, `MePing.tsx`, `OnboardingForm.tsx`, `SignInPage.tsx` still use built-in Tailwind grays/reds/black. Migrate in a single pass, not piecemeal. No `--color-danger`/`--color-success` tokens yet — add to `@theme` when first needed.

## Design Context

Mirrored from `frontend/.impeccable.md` (canonical) — keep in sync by hand.

**Users** — Primary: undergrads prepping internship/new-grad behavioral interviews. Secondary: recent grads doing repeat sessions.

**Design principles**: (1) Studio, not cram — remove chrome before adding. (2) Adult vocabulary — cut hype, exclamation marks, Duolingo-tone. (3) Restraint signals premium — no gradient cards/stat counters/illustrations/mascots. (4) One primary action per surface. (5) Metrics are data, not rewards — no animated fills/green checkmarks.

**Hero principles**: typography carries emotional load (Inter ~3.5rem clamp, weight 500 on cream); one action alone in negative space; asymmetric left-aligned; empty space is content.
