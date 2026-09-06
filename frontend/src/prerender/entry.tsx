/**
 * SSR entry for the build-time prerenderer (`scripts/prerender.mjs`).
 *
 * Renders the public marketing/legal pages to HTML strings in plain Node so
 * crawlers that don't execute JavaScript — Bing, Slack/LinkedIn/X unfurlers,
 * most AI crawlers — see real copy and real per-route metadata instead of an
 * empty `<div id="root">`.
 *
 * DELIBERATELY BYPASSES `Root.tsx` / `App.tsx`. That shell is client-only by
 * construction (`<ClerkProvider>` wrapping `<BrowserRouter>`, plus
 * `AnalyticsConsentBanner` reading `document.cookie` during render) and none of
 * it contributes anything a crawler needs. Mounting each page directly under
 * `StaticRouter` keeps Node-safety confined to this five-page subtree — the one
 * remaining gap is closed by the `@clerk/react` alias in `clerk-stub.tsx`.
 *
 * Pages are imported EAGERLY here, not through `lazyWithRetry`: code-splitting
 * exists to keep the browser's main bundle small, which is meaningless for a
 * build-time render and would only add a Suspense boundary to await.
 *
 * A consequence worth knowing: `AnalyticsConsentBanner` is now *absent* from the
 * render tree rather than suppressed inside it, so its copy can no longer leak
 * into a snapshot and become the site's search-result description. That is why
 * the old `BANNER_GUARD_PHRASE` check is gone.
 */

import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';

import BiometricDataRetentionPolicy from '../pages/BiometricDataRetentionPolicy';
import Hero from '../pages/Hero';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import Scoring from '../pages/Scoring';
import TermsOfService from '../pages/TermsOfService';

/**
 * Public pathname → page component.
 *
 * `/` maps to `Hero`, the signed-out branch of `App.tsx`'s `HomeRoute`; the
 * signed-in branch (`Home`) is account-only and never prerendered.
 *
 * Must cover every `<loc>` in `public/sitemap.xml` — `prerender.mjs` cross-checks
 * the two and fails the build on drift.
 */
export const PRERENDER_PAGES: Record<string, ComponentType> = {
  '/': Hero,
  '/scoring': Scoring,
  '/legal/privacy': PrivacyPolicy,
  '/legal/terms': TermsOfService,
  '/legal/biometric-data-retention': BiometricDataRetentionPolicy,
};

/** Renders one public route to the HTML that goes inside `<div id="root">`. */
export function renderRoute(pathname: string): string {
  const Page = PRERENDER_PAGES[pathname];
  if (!Page) {
    throw new Error(`No prerender page component mapped for "${pathname}"`);
  }
  return renderToString(
    <StaticRouter location={pathname}>
      <Page />
    </StaticRouter>,
  );
}

// Re-exported so prerender.mjs has a single import surface: one built bundle
// gives it both the bodies and the <head> values, from the same source of truth
// RouteSeo.tsx uses at runtime.
export { resolveRouteMetadata } from '../lib/routeMetadata';
