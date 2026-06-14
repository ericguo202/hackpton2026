import { useState } from 'react';

import {
  analyticsEnabled,
  getAnalyticsConsent,
  setAnalyticsConsent,
  trackEvent,
  trackPageView,
} from '../lib/analytics';
import { Button } from './ui/button';

export default function AnalyticsConsentBanner() {
  const [visible, setVisible] = useState(
    () => analyticsEnabled() && getAnalyticsConsent() === null,
  );

  if (!visible) return null;

  function choose(granted: boolean) {
    setAnalyticsConsent(granted);
    if (granted) {
      trackEvent('analytics_consent_granted');
      trackPageView(window.location.pathname);
    }
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-[80] mx-auto max-w-3xl rounded-lg border border-border-strong bg-surface-raised p-4 text-text shadow-xl">
      <div className="flex flex-col gap-4 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <p className="text-sm leading-6 text-text-subtle">
          InterviewPie uses Google Analytics to understand page views and product
          actions. We do not send resumes, transcripts, bios, company names,
          audio, video, or raw session IDs.
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
