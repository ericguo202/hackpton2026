/**
 * Single source of truth for per-route <head> metadata.
 *
 * Read from two places, deliberately:
 *  - at runtime by `components/RouteSeo.tsx`, which writes these tags into the
 *    live DOM on every SPA navigation;
 *  - at build time by `scripts/prerender.mjs`, which bakes them into each
 *    prerendered `dist/<route>/index.html` so crawlers that never execute our
 *    JavaScript still get the right title, description and canonical.
 *
 * It lives in its own module rather than as extra exports from `RouteSeo.tsx`
 * because `react-refresh/only-export-components` requires component files to
 * export only components.
 *
 * Adding a public page? Add it here AND to `public/sitemap.xml` — the
 * prerenderer derives its route list from the sitemap, and cross-checks it
 * against this table so the two can't silently drift.
 */

export const SITE_ORIGIN = 'https://www.interviewpie.com';

export const DEFAULT_DESCRIPTION =
  'Practice behavioral interviews out loud with AI follow-up questions, role-specific scoring, transcript feedback, and optional delivery coaching.';

export const INDEX_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

export const NOINDEX_ROBOTS = 'noindex, nofollow';

interface PublicRouteMetadata {
  title: string;
  description: string;
}

export const PUBLIC_ROUTE_METADATA: Record<string, PublicRouteMetadata> = {
  '/': {
    title: 'InterviewPie | AI Behavioral Interview Practice & Feedback',
    description: DEFAULT_DESCRIPTION,
  },
  '/scoring': {
    title: 'How InterviewPie Scores Behavioral Interview Answers',
    description:
      'See the role-aware rubrics InterviewPie uses to score structure, reasoning, impact, initiative, depth, and delivery in behavioral interview practice.',
  },
  '/legal/privacy': {
    title: 'Privacy Policy | InterviewPie',
    description:
      'Learn how InterviewPie collects, uses, retains, and protects information when you use the behavioral interview practice service.',
  },
  '/legal/terms': {
    title: 'Terms of Service | InterviewPie',
    description:
      'Read the terms that govern access to and use of the InterviewPie behavioral interview practice service.',
  },
  '/legal/biometric-data-retention': {
    title: 'Biometric Data Retention Policy | InterviewPie',
    description:
      'Learn how InterviewPie handles camera-derived delivery analytics and biometric-related data during interview practice.',
  },
};

const PRIVATE_ROUTE_TITLES: Record<string, string> = {
  '/sign-in': 'Sign In | InterviewPie',
  '/sign-up': 'Create an Account | InterviewPie',
  '/onboarding': 'Set Up Your Interview Profile | InterviewPie',
  '/practice': 'Interview Practice | InterviewPie',
  '/history': 'Practice History | InterviewPie',
  '/personalize': 'Personalize Interview Practice | InterviewPie',
  '/calibrate': 'Delivery Calibration | InterviewPie',
  '/delivery-playground': 'Delivery Playground | InterviewPie',
  '/settings': 'Settings | InterviewPie',
};

function privateTitle(pathname: string): string {
  if (PRIVATE_ROUTE_TITLES[pathname]) return PRIVATE_ROUTE_TITLES[pathname];
  if (pathname.startsWith('/sessions/')) return 'Interview Results | InterviewPie';
  if (pathname.startsWith('/saved-question/')) {
    return 'Saved Interview Question | InterviewPie';
  }
  return 'InterviewPie';
}

/** Trailing slashes are stripped so `/scoring/` and `/scoring` resolve alike. */
export function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export interface ResolvedRouteMetadata {
  /** Normalized pathname this metadata was resolved for. */
  pathname: string;
  title: string;
  description: string;
  robots: string;
  /** Absolute canonical URL, or null on account-only routes (nothing to index). */
  canonical: string | null;
  /** Absolute URL for `og:url`; set even where there is no canonical. */
  ogUrl: string;
  isPublic: boolean;
}

export function resolveRouteMetadata(pathname: string): ResolvedRouteMetadata {
  const normalized = normalizePathname(pathname);
  const publicMetadata = PUBLIC_ROUTE_METADATA[normalized];
  const canonical = publicMetadata ? `${SITE_ORIGIN}${normalized}` : null;

  return {
    pathname: normalized,
    title: publicMetadata?.title ?? privateTitle(normalized),
    description: publicMetadata?.description ?? DEFAULT_DESCRIPTION,
    robots: publicMetadata ? INDEX_ROBOTS : NOINDEX_ROBOTS,
    canonical,
    ogUrl: canonical ?? `${SITE_ORIGIN}${normalized}`,
    isPublic: Boolean(publicMetadata),
  };
}
