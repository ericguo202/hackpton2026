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

**FormData quirk**: `useApi` detects `FormData` bodies and intentionally omits `Content-Type`, letting the browser set the multipart boundary. If you hand-roll a request with FormData, do the same — setting `application/json` breaks multipart parsing server-side.

### App shell

`src/main.tsx` wraps `<App />` in `<ClerkProvider>`. `src/App.tsx` splits on `<Show when="signed-out">` → `SignInPage`, `<Show when="signed-in">` → `SignedInApp`, which then gates on `me.completed_registration` to show `OnboardingForm` vs. the dashboard. `OnboardingForm` calls `onDone` → parent `refetch()` on `useMe` → gate flips without a page reload.

### Type contract with backend

`src/types/user.ts` manually mirrors `backend/app/schemas/user.py` (`UserOut`). There is no codegen. When the Pydantic schema changes, update `MeResponse` by hand — and vice versa. The backend lives at `../backend` (sibling directory, not a submodule); read it directly for the canonical shape.

### Routes currently wired

Backend exposes `/api/v1/health`, `/api/v1/me`, `/api/v1/onboarding`. Frontend consumes `/me` (via `useMe`) and `/onboarding` (via `OnboardingForm`). **Not yet built**: `/sessions`, `/sessions/{id}/turns`, `/me/stats` — these are the next milestones per `../CLAUDE.md` build order. When you add UI for them, put network calls behind new hooks following the `useMe` pattern, not inline `apiFetch` in components.

## House style

- `MePing` is a deliberate debug widget rendering the `/me` JSON — leave it in during development, remove before demo.
- Components have header doc-comments explaining their role in the flow. Keep this style when adding new ones — the comments are terse but load-bearing for anyone joining mid-hackathon.

## Design system

Earth-tone editorial palette with serif display + sans body. Everything is wired through Tailwind 4's `@theme` block in `src/index.css` — **no `tailwind.config.js` exists, and none should be added**.

### Source of truth

`src/index.css` `@theme { ... }` is the single source of design tokens. Adding a new color, font, or radius means editing that block — never hand-type hex or `px` in components. Tailwind 4 auto-generates the matching utility (`--color-foo-500` → `bg-foo-500`, `text-foo-500`, `border-foo-500`; `--font-foo` → `font-foo`; `--radius-foo` → `rounded-foo`).

### Color system

Nine scales (`primary`, `secondary`, `tertiary`, `quaternary`, `quinary`, `senary`, `septenary`, `octonary`, `grey`), each with stops `100` → `700` (100 lightest, 700 darkest). All earth tones — beige, taupe, olive, warm near-black. No vibrant accents in the palette; `primary/700` (`#17150f`) is the brand "ink" used for buttons, links, and focus rings.

Base page background is `primary/100` (`#F1E9D2`), set globally on `:root`. Most UI should sit directly on this surface; elevate with `surface-raised` only when a card needs to distinguish itself.

### Token hierarchy (important)

**Prefer semantic tokens in component code.** Reach for the raw scale only when no semantic alias fits, and when that happens consider whether a new semantic alias should be added instead.

| Use case              | Semantic utility                      | Resolves to       |
| --------------------- | ------------------------------------- | ----------------- |
| Page background       | `bg-surface`                          | primary/100       |
| Card / elevated panel | `bg-surface-raised`                   | tertiary/100      |
| Subtle well / input   | `bg-surface-sunken`                   | quaternary/100    |
| Default border        | `border-border`                       | primary/200       |
| Stronger border       | `border-border-strong`                | primary/300       |
| Body text             | `text-text`                           | primary/700       |
| Muted text            | `text-text-muted`                     | primary/500       |
| Subtle / helper text  | `text-text-subtle`                    | primary/400       |
| Primary button bg     | `bg-accent` + `text-accent-fg`        | primary/700 + 100 |
| Primary button hover  | `hover:bg-accent-hover`               | primary/600       |
| Focus ring            | `ring-focus-ring`                     | primary/700       |

If you find yourself writing `bg-primary-500` in a component, pause — is this really a one-off, or should `--color-something` be added to `@theme`?

### Typography

- `--font-display` = **Fraunces** (variable, opsz 9–144). Use for headings and marketing copy.
- `--font-sans` = **Geist**. Default on `<body>`; inherits everywhere — don't apply `font-sans` explicitly.
- `--font-mono` = Geist Mono fallback. Reserved for code blocks.

The base `h1..h6` selectors in `index.css` already set the display serif, weight 500, tightened letter-spacing, and a responsive `clamp()` for h1/h2. Use semantic heading tags (`<h1>`, `<h2>`, `<h3>`) and let the CSS do the work. Only add `font-display` / `font-sans` when you need the opposite of the default (e.g., a serif paragraph pull-quote, or a sans subtitle under a serif heading).

Fraunces and Geist load from Google Fonts via `@import` in `index.css`. If offline-demo reliability matters, swap to `@fontsource/fraunces` + `@fontsource/geist-sans` — the token names don't change.

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
className="... focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
```

Do not remove `outline` without replacing it with a visible ring. Accessibility is not optional.

### Dark mode

**Not supported.** The palette is light-biased (all base colors are pale cream/tan). Do not add `dark:` variants or a theme toggle. If dark mode becomes a product requirement post-hackathon, it's a dedicated project — pick new dark swatches, don't invert these.

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

- **Typography carries the emotional load.** Fraunces at confident size (clamp up to ~3.5rem) on a cream page does more than any illustration or gradient could. Resist hero images, mesh gradients, 3D objects, animated blobs.
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
