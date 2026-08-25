import { useEffect } from 'react';
import { useLocation } from 'react-router';

const SITE_ORIGIN = 'https://www.interviewpie.com';
const DEFAULT_DESCRIPTION =
  'Practice behavioral interviews out loud with AI follow-up questions, role-specific scoring, transcript feedback, and optional delivery coaching.';
const INDEX_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

interface PublicRouteMetadata {
  title: string;
  description: string;
}

const PUBLIC_ROUTE_METADATA: Record<string, PublicRouteMetadata> = {
  '/': {
    title: 'InterviewPie | AI Behavioral Interview Practice & Feedback',
    description: DEFAULT_DESCRIPTION,
  },
  '/scoring': {
    title: 'How InterviewPie Scores Behavioral Interview Answers',
    description:
      'See the role-aware rubrics InterviewPie uses to score structure, reasoning, impact, initiative, depth, and delivery in behavioral interview practice.',
  },
  '/pricing': {
    title: 'Pricing | InterviewPie',
    description:
      'InterviewPie is free: 10 interview questions a day, 10 practice sessions a week, AI scoring and feedback on every answer, and no credit card required.',
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

function setMeta(
  attribute: 'name' | 'property',
  key: string,
  content: string,
) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(url: string | null) {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!url) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = url;
}

function privateTitle(pathname: string) {
  if (PRIVATE_ROUTE_TITLES[pathname]) return PRIVATE_ROUTE_TITLES[pathname];
  if (pathname.startsWith('/sessions/')) return 'Interview Results | InterviewPie';
  if (pathname.startsWith('/saved-question/')) {
    return 'Saved Interview Question | InterviewPie';
  }
  return 'InterviewPie';
}

/** Keeps SPA route metadata accurate and marks account-only pages as noindex. */
export default function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const normalizedPathname =
      pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const publicMetadata = PUBLIC_ROUTE_METADATA[normalizedPathname];
    const title = publicMetadata?.title ?? privateTitle(normalizedPathname);
    const description = publicMetadata?.description ?? DEFAULT_DESCRIPTION;
    const canonicalUrl = publicMetadata
      ? `${SITE_ORIGIN}${normalizedPathname}`
      : null;

    document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', publicMetadata ? INDEX_ROBOTS : 'noindex, nofollow');
    setCanonical(canonicalUrl);

    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta(
      'property',
      'og:url',
      canonicalUrl ?? `${SITE_ORIGIN}${normalizedPathname}`,
    );
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
  }, [pathname]);

  return null;
}
