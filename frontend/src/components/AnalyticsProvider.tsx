import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation } from 'react-router';

import {
  analyticsEnabled,
  initAnalytics,
  normalizeAnalyticsPath,
  trackPageView,
  trackUiClick,
} from '../lib/analytics';

function clickableFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('button,a,[role="button"],[role="tab"]');
}

function elementRole(element: HTMLElement): string {
  if (element instanceof HTMLAnchorElement) return 'link';
  if (element.getAttribute('role') === 'tab') return 'tab';
  return 'button';
}

function safeClickLabel(element: HTMLElement): string {
  return (
    element.dataset.analyticsLabel
    ?? element.dataset.analyticsId
    ?? element.getAttribute('aria-label')
    ?? element.getAttribute('title')
    ?? 'unlabeled'
  ).slice(0, 80);
}

export default function AnalyticsProvider() {
  const location = useLocation();
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!analyticsEnabled()) return;
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!analyticsEnabled() || !isLoaded) return;
    trackPageView(location.pathname, {
      signed_in: Boolean(isSignedIn),
    });
  }, [isLoaded, isSignedIn, location.pathname]);

  useEffect(() => {
    if (!analyticsEnabled() || !isLoaded) return;

    function handleClick(event: MouseEvent) {
      const element = clickableFrom(event.target);
      if (!element) return;
      if (
        element instanceof HTMLButtonElement
        && (element.disabled || element.getAttribute('aria-disabled') === 'true')
      ) {
        return;
      }

      trackUiClick({
        page_path: normalizeAnalyticsPath(window.location.pathname),
        element_role: elementRole(element),
        analytics_id: element.dataset.analyticsId ?? 'unlabeled',
        label: safeClickLabel(element),
        signed_in: Boolean(isSignedIn),
      });
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isLoaded, isSignedIn]);

  return null;
}
