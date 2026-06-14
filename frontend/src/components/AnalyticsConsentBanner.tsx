import { useState } from 'react';
import { Link } from 'react-router';

import { useMe } from '../hooks/useMe';
import {
  ackAnalyticsNotice,
  analyticsEnabled,
  getAnalyticsConsent,
  getAnalyticsRegion,
  gpcOptOut,
  hasAckedNotice,
  isDefaultOnRegion,
  setAnalyticsConsent,
  trackEvent,
  trackPageView,
} from '../lib/analytics';
import { needsPolicyAcceptance } from '../lib/policyAcceptance';
import { Button } from './ui/button';

export default function AnalyticsConsentBanner() {
  const { me } = useMe();
  const [dismissed, setDismissed] = useState(false);

  // Two shapes, keyed on the visitor's jurisdiction bucket:
  //  - `strict` (EU/UK/India/elsewhere/unknown): an *opt-in* prompt — nothing has
  //    loaded yet, Accept/Decline records the explicit choice.
  //  - `us` / `implied`: a *notice + opt-out* — analytics is already on by default,
  //    so we inform and offer an opt-out, and remember a plain dismissal separately
  //    (`hasAckedNotice`) so acking never counts as a grant.
  // Both wait out the forced policy-acceptance modal (`needsPolicyAcceptance`) so the
  // two never stack; `PolicyAcceptanceGate` refetches `me` and `useMe` broadcasts the
  // fresh row here, flipping the gate and revealing the banner.
  const defaultOn = isDefaultOnRegion();
  const visible =
    !dismissed
    && analyticsEnabled()
    && !gpcOptOut()
    && getAnalyticsConsent() === null
    && (!defaultOn || !hasAckedNotice())
    && !needsPolicyAcceptance(me);

  if (!visible) return null;

  function chooseStrict(requested: boolean) {
    // Use the effective persisted value — a grant the browser couldn't store
    // stays denied, so we don't fire grant events for analytics that isn't on.
    const granted = setAnalyticsConsent(requested);
    if (granted) {
      trackEvent('analytics_consent_granted');
      trackPageView(window.location.pathname);
    }
    setDismissed(true);
  }

  function optOut() {
    setAnalyticsConsent(false);
    setDismissed(true);
  }

  function acknowledge() {
    ackAnalyticsNotice();
    setDismissed(true);
  }

  // Region-specific body copy. The implied-consent regions (AU/NZ/SG) run only
  // aggregate, cookieless pings by default, so we say so plainly.
  const cookieless = getAnalyticsRegion() === 'implied';
  const description = defaultOn
    ? cookieless
      ? `InterviewPie uses Google Analytics to understand page views and product
         actions. Based on your location we collect only aggregate, cookieless
         analytics by default — no advertising, and no résumés, transcripts, bios,
         company names, audio, video, or raw session IDs. You can opt out anytime.`
      : `InterviewPie uses Google Analytics to understand page views and product
         actions. Based on your location this is on by default — no advertising, and
         no résumés, transcripts, bios, company names, audio, video, or raw session
         IDs. You can opt out anytime.`
    : `InterviewPie uses Google Analytics to understand page views and product
       actions. Nothing is sent to Google unless you accept. We do not send résumés,
       transcripts, bios, company names, audio, video, or raw session IDs.`;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[80] mx-auto max-w-3xl rounded-lg border border-border-strong bg-surface-raised p-4 text-text shadow-xl">
      <div className="flex flex-col gap-4 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <p className="text-xs leading-5 text-text-subtle">
          {description}{' '}
          See our{' '}
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
          {defaultOn ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={optOut}
                data-analytics-id="analytics_optout"
                data-analytics-label="Opt out of analytics"
              >
                Opt out
              </Button>
              <Button
                type="button"
                onClick={acknowledge}
                data-analytics-id="analytics_notice_ack"
                data-analytics-label="Acknowledge analytics notice"
              >
                Got it
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => chooseStrict(false)}
                data-analytics-id="analytics_consent_decline"
                data-analytics-label="Decline analytics"
              >
                Decline
              </Button>
              <Button
                type="button"
                onClick={() => chooseStrict(true)}
                data-analytics-id="analytics_consent_accept"
                data-analytics-label="Accept analytics"
              >
                Accept
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
