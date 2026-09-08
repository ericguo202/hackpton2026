import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { resolveRouteMetadata } from '../lib/routeMetadata';

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

/**
 * Keeps SPA route metadata accurate and marks account-only pages as noindex.
 *
 * The values come from `lib/routeMetadata.ts`, which the build-time prerenderer
 * (`scripts/prerender.mjs`) reads too — so a crawler that never runs this effect
 * still gets the same tags baked into `dist/<route>/index.html`. Keep the set of
 * tags written here in sync with the set the prerenderer injects.
 */
export default function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const { title, description, robots, canonical, ogUrl } =
      resolveRouteMetadata(pathname);

    document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', robots);
    setCanonical(canonical);

    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', ogUrl);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
  }, [pathname]);

  return null;
}
