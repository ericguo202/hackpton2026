/**
 * PrivacyPanel — shared content for the Home setup screen's "Privacy" surface
 * (desktop `PrivacyPanelDrawer` + mobile Privacy tab). Lets the user view the
 * delivery-analytics consent disclosures and grant or revoke consent at any
 * time. This is the persistent management home for the consent that the
 * pre-session `DeliveryConsentDialog` captures just-in-time.
 *
 * Presentational: consent state + grant/revoke handlers live in `Home.tsx`.
 * The acceptance checkbox is transient UI state and stays local here.
 */

import { ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  analyticsEnabled,
  analyticsMode,
  getAnalyticsConsent,
  getAnalyticsRegion,
  gpcOptOut,
  setAnalyticsConsent,
  trackEvent,
  trackPageView,
} from '../lib/analytics';
import DeliveryConsentBullets from './DeliveryConsentBullets';
import { Button } from './ui/button';

type Props = {
  active: boolean;
  busy: boolean;
  error: string | null;
  consentLabel: string | null;
  onGrant: () => void;
  onRevoke: () => void;
  // The Google Analytics toggle belongs only on the dedicated /settings Privacy
  // tab. On the Home setup screen the Privacy surface is scoped to delivery
  // analytics, so this is set false there to omit the GA block.
  showAnalytics?: boolean;
};

export default function PrivacyPanel({
  active,
  busy,
  error,
  consentLabel,
  onGrant,
  onRevoke,
  showAnalytics = true,
}: Props) {
  const [checked, setChecked] = useState(false);
  // Tracked only to force a re-render after a toggle; the displayed state is the
  // *effective* mode (region default + explicit choice + GPC), read live below.
  const [, setLocalAnalyticsConsent] = useState<
    'granted' | 'denied' | null
  >(() => analyticsEnabled() ? getAnalyticsConsent() : null);
  // Browser-level opt-out (GPC) overrides the toggle below — honored as binding.
  const gpc = gpcOptOut();
  // off / full / cookieless, resolved from region + stored choice + GPC.
  const mode = analyticsEnabled() ? analyticsMode() : 'off';
  const on = mode !== 'off';
  const cookieless = mode === 'cookieless';
  const defaultOn = analyticsEnabled() && getAnalyticsRegion() !== 'strict';

  function updateProductAnalytics(requested: boolean) {
    if (!requested) {
      trackEvent('analytics_consent_revoked');
    }
    // Reflect the effective persisted value, not the request — if the browser
    // refuses to store the grant, the toggle shows denied (analytics stays off).
    const granted = setAnalyticsConsent(requested);
    setLocalAnalyticsConsent(granted ? 'granted' : 'denied');
    if (granted) {
      trackEvent('analytics_consent_granted');
      trackPageView(window.location.pathname);
    }
  }

  return (
    <div className="space-y-4">
      {showAnalytics && analyticsEnabled() && (
        <div className="rounded border border-border bg-surface-sunken px-3 py-3">
          <p className="text-sm font-medium text-text">
            Google Analytics
          </p>
          <p className="mt-2 text-xs leading-5 text-text-subtle">
            Tracks page views and product actions without resumes, transcripts,
            bios, company names, audio, video, or raw session IDs.
            {defaultOn
              ? cookieless
                ? ' Based on your location, only aggregate, cookieless analytics'
                  + ' runs by default — you can turn it off here.'
                : ' Based on your location, analytics runs by default — you can turn'
                  + ' it off here.'
              : ' Nothing is sent to Google unless you enable it here.'}
          </p>
          {!gpc && (
            <p className="mt-2 text-xs font-medium leading-5 text-text">
              {on
                ? cookieless
                  ? 'Currently on (aggregate, cookieless).'
                  : 'Currently on.'
                : 'Currently off.'}
            </p>
          )}
          {gpc && (
            <p className="mt-2 text-xs leading-5 text-text-muted">
              Your browser is sending a Global Privacy Control signal, so
              analytics stays off regardless of this setting.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={on && !gpc ? 'default' : 'outline'}
              disabled={gpc}
              onClick={() => updateProductAnalytics(true)}
              data-analytics-id="analytics_privacy_enable"
              data-analytics-label="Enable product analytics"
            >
              Enable analytics
            </Button>
            <Button
              type="button"
              variant={!on ? 'default' : 'outline'}
              onClick={() => updateProductAnalytics(false)}
              data-analytics-id="analytics_privacy_disable"
              data-analytics-label="Disable product analytics"
            >
              Disable analytics
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4 rounded border border-border bg-surface-sunken px-3 py-3">
        <div className="flex gap-3">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium text-text">
              Practice delivery analytics
            </p>
            <p className="mt-2 text-xs leading-6 text-text-subtle">
              Controls the numeric delivery summaries stored with your practice
              answers. Separate from local calibration, which never leaves your
              browser.
            </p>
          </div>
        </div>

        <DeliveryConsentBullets />

        {active ? (
          <div className="rounded border border-border bg-surface-raised px-3 py-3">
            <p className="text-xs font-medium text-text">
              {consentLabel ?? 'Delivery analytics consent is active'}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-subtle">
              Deleting disables future camera delivery summaries and removes
              stored delivery summaries, delivery scores, and delivery-specific
              coaching from completed history.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onRevoke}
              className="mt-3"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Delete delivery analytics
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded border border-border bg-surface-raised px-3 py-3 text-xs leading-5 text-text-subtle">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.currentTarget.checked)}
                disabled={busy}
                className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
              />
              <span>
                I am authorized to consent and agree to camera-based delivery
                analytics and storage of numeric delivery summaries for coaching.
              </span>
            </label>
            <Button
              type="button"
              disabled={!checked || busy}
              onClick={onGrant}
            >
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
              Enable delivery analytics
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs leading-5 text-text">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
