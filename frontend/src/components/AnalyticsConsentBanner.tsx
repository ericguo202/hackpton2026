import { useState } from 'react';
import { Link } from 'react-router';

import { useMe } from '../hooks/useMe';
import {
  analyticsEnabled,
  getAnalyticsConsent,
  gpcOptOut,
  setAnalyticsConsent,
  trackEvent,
  trackPageView,
} from '../lib/analytics';
import { needsPolicyAcceptance } from '../lib/policyAcceptance';
import { Button } from './ui/button';

export default function AnalyticsConsentBanner() {
  const { me } = useMe();
  const [dismissed, setDismissed] = useState(false);

  // Strict opt-in: only prompt when analytics is configured, the browser isn't
  // already opting out via GPC, and the user hasn't chosen yet. Also hold off
  // while the forced policy-acceptance modal is up (`needsPolicyAcceptance`) so
  // the two never stack. When the user accepts, `PolicyAcceptanceGate` refetches
  // `me`; `useMe` broadcasts that fresh row to this (separate) instance, so
  // `needsPolicyAcceptance` flips to false here and the banner appears.
  const visible =
    !dismissed
    && analyticsEnabled()
    && !gpcOptOut()
    && getAnalyticsConsent() === null
    && !needsPolicyAcceptance(me);

  if (!visible) return null;

  function choose(requested: boolean) {
    // Use the effective persisted value — a grant the browser couldn't store
    // stays denied, so we don't fire grant events for analytics that isn't on.
    const granted = setAnalyticsConsent(requested);
    if (granted) {
      trackEvent('analytics_consent_granted');
      trackPageView(window.location.pathname);
    }
    setDismissed(true);
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-[80] mx-auto max-w-3xl rounded-lg border border-border-strong bg-surface-raised p-4 text-text shadow-xl">
      <div className="flex flex-col gap-4 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <p className="text-xs leading-5 text-text-subtle">
          InterviewPie uses Google Analytics to understand page views and product
          actions. Nothing is sent to Google unless you accept. We do not send
          resumes, transcripts, bios, company names, audio, video, or raw session
          IDs. See our{' '}
          <Link
            to="/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 transition-colors hover:text-text"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => choose(false)}
            data-analytics-id="analytics_consent_decline"
            data-analytics-label="Decline analytics"
          >
            Decline
          </Button>
          <Button
            type="button"
            onClick={() => choose(true)}
            data-analytics-id="analytics_consent_accept"
            data-analytics-label="Accept analytics"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
