/* eslint-disable react-refresh/only-export-components */
/**
 * Build-time-only stand-in for `@clerk/react`.
 *
 * `scripts/prerender.mjs` aliases `@clerk/react` to this file for the SSR bundle
 * ONLY — the alias is passed inline to vite's `build()` and never written into
 * `vite.config.ts`, so it cannot reach the client build. Nothing in the app
 * imports this module.
 *
 * WHY IT EXISTS: the only thing stopping the five public pages from rendering in
 * plain Node is a missing React *context*, not a browser API — `Scoring.tsx`
 * calls `useAuth()`, which throws outside `<ClerkProvider>`. A context-free stub
 * fixes that completely, which is why no other component in the public tree
 * needed touching.
 *
 * WHY ANSWERING "signed out" IS CORRECT, NOT A FICTION: Clerk loads
 * asynchronously, so the real app already renders `isSignedIn === false` on
 * first paint for EVERY visitor. The stub reproduces the app's genuine first
 * frame rather than inventing a state. It stays correct afterwards because
 * `main.tsx` uses `createRoot()` (not `hydrateRoot()`): React discards the
 * prerendered markup and remounts with real Clerk state, exactly as today. And
 * crawlers are never signed in, so the signed-out chrome is the right thing to
 * freeze anyway.
 *
 * ASSUMPTION TO KEEP IN VIEW: this answers `false` for ANY page added to
 * `entry.tsx`'s page map, silently. That is safe while the list is public
 * marketing/legal pages, where `isSignedIn` only drives chrome (the TopBar's nav
 * and right slot). A future page whose *content* varies by auth would have its
 * signed-out version frozen into the HTML unnoticed.
 */

import type { ReactNode } from 'react';

/** Marker string asserted absent from the client bundle by the build check. */
export const PRERENDER_CLERK_STUB = 'prerender-clerk-stub';

export const useAuth = () => ({
  isSignedIn: false,
  isLoaded: true,
  userId: null,
  getToken: async () => null,
});

export const useUser = () => ({
  isSignedIn: false,
  isLoaded: true,
  user: null,
});

export const useClerk = () => ({});

export const UserButton = () => null;

export const Show = ({
  when,
  children,
}: {
  when?: string;
  children?: ReactNode;
}) => (when === 'signed-out' ? <>{children}</> : null);
