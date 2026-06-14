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
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX       # optional; unset = analytics fully disabled. Strict opt-in even when set
VITE_GA_DEBUG=false                       # optional; "true" → console.debug every gtag command in dev
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
- **`_helpers.ts`** — `SCORE_KEYS`, `SCORE_COLOR_MAP`, `num()`, `turnAverage()`, `improvementMomentsOf()`. `SCORE_COLOR_MAP` mirrors `History.tsx:DIMENSIONS` — change one, change both.

**Load-bearing layout facts** (caught/fixed during iteration — don't re-introduce):

- **Tab/corner alignment**: `FolderTabs` strip lives **inside** the card's flex column (not the outer gutter row). Card carries `min-[900px]:rounded-tl-none`. Moving the strip out → active tab floats into gutter; dropping `rounded-tl-none` → card curve artifact.
- **Sticky chevrons**: `items-start` on gutter column + `sticky; top: 50vh; -translate-y-1/2` on wrapper. `items-start` is load-bearing: `items-center` puts natural position at column middle (far below viewport), satisfying `top:50vh` so sticky never engages. `items-start` puts it above threshold → sticky pins at viewport middle from first paint.
- **Native `title`** for chevron hover (not custom tooltip — sticky wrapper's `translateY(-50%)` creates a containing block that broke absolute tooltip positioning).

**Mobile (<900px)**: drops folder strip, chevrons, 2-col layouts → single vertical stack. Nav: horizontal swipe (`|dx|>60 && |dx|>1.5·|dy|`) + bottom Prev/Next row.

**Issue-type chips**: `formatIssueType(raw)` — generic snake_case → Title Case. Don't hard-code a switch (generic handles unknown/legacy).

### Transcript feedback highlighting (shared by Practice + SessionDetail)

The per-turn cards live in **`components/session-detail/_turnInnerCards.tsx`** and are reused by **both** `TurnPanel.tsx` (SessionDetail) and `PracticeTurnPanel.tsx` (Practice) — change the feature once, it lands on both surfaces.

- **Filler highlighting** — `QuestionAnswerCard` renders the transcript via `lib/fillerWords.ts:tokenizeTranscript` (frontend mirror of the backend regex). `renderTranscriptToken` is the shared per-token renderer (chart-2 filler chip vs plain span).
- **Improvement-moment highlighting + click-to-jump** — flagged sentences are highlighted in cherry (`bg-accent/15`, the same color as the Improvement Moments section) and are clickable: clicking scrolls the matching moment into view and flashes its left border.
  - **Matching (`lib/transcriptHighlight.ts:segmentTranscriptByImprovements`)** splits the transcript into `plain` / `improvement` segments. Each snippet is located by its **trimmed** value via `indexOf` — mirroring the backend's `_drop_unanchored_moments` (`snippet.strip() in transcript`) guarantee. **Rule: a snippet that doesn't appear verbatim is NOT highlighted** (graceful no-op on legacy/edge data). Overlapping snippet ranges are dropped greedily (earliest wins) so spans never nest into each other. Every segment is itself run through `tokenizeTranscript`, so **filler highlights nest inside** improvement spans (the two layers stack, not fight).
  - **Index source of truth**: both cards derive the moments array (and therefore each `momentIndex`) from `_helpers.ts:improvementMomentsOf(turn)` (`improvement_moments ?? coaching_moments ?? []`) so the transcript→moment link can't drift.
  - **Flash channel (`_momentFlash.ts`)** — a per-turn React context (`MomentFlashContext` / `useMomentFlash` / `useProvideMomentFlash(turn.id)`). The transcript card and the moments card sit in separate grid rows, so the click→flash path goes through context, not props. Each panel wraps its content in `<MomentFlashContext.Provider value={useProvideMomentFlash(turn.id)}>`. DOM ids are deterministic (`improvement-moment-${turn.id}-${i}`; `turn.id` is stable for real turns AND Practice replay turns `local-${idx}`). Scroll happens in an effect (post-render) so the target exists after re-key remount; a ref-backed `nonce` lets a repeat click of the **same** snippet replay (the moment `<li>`'s `key` includes the nonce → remount → CSS animation re-runs).
  - **Animation** — `index.css:.moment-flash` / `@keyframes moment-flash-border` brightens the left border to `--color-accent` + a brief left-edge glow, no `forwards` fill so the resting `border-accent/45` reclaims the property. Included in the `prefers-reduced-motion: reduce` reset (and `scrollIntoView` falls back to `behavior: 'auto'`).

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

InterviewPie 2026 rebrand (root `DESIGN.md`, "Prep Kitchen"): vanilla surface, cherry action color, amber garnish, **DM Sans 600/700 headings over Inter body** (Geist Mono reserved for code). Wired through Tailwind 4's `@theme` block in `src/index.css` — **no `tailwind.config.js`, and none should be added**.

`src/index.css` `@theme { ... }` is the single source of design tokens — never hand-type hex/`px` in components.

### Color system

Nine legacy scales (`primary`…`grey`), stops `100`(lightest)→`700`(darkest), collapsed into one warm-neutral family tinted toward the brand amber hue. `primary/700` (`#271812`) is cocoa "ink". Page bg `primary/100` (`#FDF8F2`, vanilla). Brand tokens live alongside: `--color-cherry` (+`-deep`/`-glaze`/`-tint`) and `--color-amber` (+`-deep`/`-tint`).

**Named rules (DESIGN.md §2):** cherry covers ≤~10% of any screen (primary action, selection, links — two competing cherry elements means one is wrong). Amber is garnish: never type on light surfaces, never a fill under white text; dark mode alone grants it text/focus-ring rights.

### Token hierarchy — prefer semantic tokens; reach for raw scale only when no alias fits.

| Use case              | Semantic utility               | Resolves to (light)    |
| --------------------- | ------------------------------ | ---------------------- |
| Page background       | `bg-surface`                   | vanilla `#FDF8F2`      |
| Card / elevated panel | `bg-surface-raised`            | card white `#FFFFFF`   |
| Subtle well / input   | `bg-surface-sunken`            | sunken `#F6EDE2`       |
| Default border        | `border-border`                | warm hairline `#E8DCCB`|
| Stronger border       | `border-border-strong`         | `#D4C3AC`              |
| Body text             | `text-text`                    | ink `#271812`          |
| Muted text            | `text-text-muted`              | `#6E5D50`              |
| Subtle / helper text  | `text-text-subtle`             | `#7C6B5D`              |
| Primary button        | `bg-accent` + `text-accent-fg` | cherry `#C41E3A` + white |
| Primary button hover  | `hover:bg-accent-hover`        | cherry-deep `#A8172F`  |
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

Class strategy on `<html>` + curated token swap (**black cherry** `#1C1214`, NOT an inversion).

- **Mechanism**: `html.dark { … }` overrides **only semantic aliases + six `--color-chart-N` + rate bands**. Specificity: `html.dark` (0,1,1) beats `@theme`'s `:root` (0,1,0). `@custom-variant dark (&:where(.dark, .dark *))` for one-off `dark:` utilities.
- **No-flash init (`index.html`)**: blocking inline script sets `dark` class before first paint. First visit follows OS `prefers-color-scheme`; then `localStorage['theme']` wins.
- **State**: `src/hooks/useTheme.ts` — `useSyncExternalStore` whose snapshot is the `<html>` class. `ThemeToggle.tsx` in TopBar (always visible).
- Primary buttons stay cherry-with-white in both themes; dark hover **brightens** (`#D63B53`) instead of darkening. Accent-level *text* in dark uses cherry-glaze (`dark:text-cherry-glaze`); focus ring flips to amber.
- The manila "case file" exception was **retired in rebrand stage 2**: the SessionDetail/Practice folder card is plain `bg-surface-raised`, inner tiles are `bg-surface-sunken`, and the `html.dark .bg-tertiary-200` re-scoping blocks are gone from `index.css`. Don't re-pin light surfaces in dark mode.
- **Clerk is theme-aware**: `main.tsx` wraps `ClerkProvider` in a `Root` reading `useTheme()`, builds `appearance` from light/dark `variables` (light: white/ink/cherry; dark: black-cherry/cream/cherry-glaze).
- Calibration camera box uses an intentionally-dark raw hex (`#150D0F`, correct in both themes); SignIn/SignUp recolor the dither shader per theme via `useTheme()`.

### Tech debt

The built-in Tailwind gray/red migration is **done** (rebrand stage 2) — components use semantic tokens throughout. No `--color-danger`/`--color-success` tokens yet — destructive reuses cherry by doctrine; add tokens to `@theme` only if a genuinely separate semantic emerges.

## Design Context

Canonical sources: root `PRODUCT.md` + `DESIGN.md` (the 2026 "Prep Kitchen" spec); stage briefs in `.impeccable/`.

**Users** — Primary: undergrads prepping internship/new-grad behavioral interviews. Secondary: recent grads doing repeat sessions.

**Design principles**: (1) Studio, not cram — remove chrome before adding. (2) Adult vocabulary — cut hype, exclamation marks, Duolingo-tone. (3) Restraint signals premium — no gradients/shadows/stat counters/illustrations/mascots, no bakery kitsch. (4) One primary action per surface, marked in cherry. (5) Metrics are data, not rewards — no animated fills/green checkmarks. (6) Eyebrow labels are a data-label voice (metric displays, one running head per page) — never section scaffolding.

**Hero principles**: typography carries emotional load (DM Sans 600/700 display on vanilla); one action alone in negative space; asymmetric left-aligned; empty space is content.
