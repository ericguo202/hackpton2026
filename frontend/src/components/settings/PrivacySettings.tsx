/**
 * PrivacySettings — body of the custom "Privacy" page injected into Clerk's
 * <UserProfile> on /settings. Three sections, two of which previously had no
 * home in the UI:
 *   1. Analytics & consent — reuses the setup-screen `PrivacyPanel` (Google
 *      Analytics + delivery-analytics consent) driven by `useDeliveryConsent`.
 *   2. Consent receipts — the clickwrap record (which policy version accepted
 *      when), read straight off `useMe()`.
 *   3. Your data — an in-app export (GDPR Art. 15/20 / CCPA right-to-know),
 *      previously reachable only on the ToS-decline path.
 */

import { useState } from 'react';
import { Download } from 'lucide-react';

import PrivacyPanel from '../PrivacyPanel';
import { Button } from '../ui/button';
import { useApi } from '../../hooks/useApi';
import { useDeliveryConsent } from '../../hooks/useDeliveryConsent';
import { useFaceCalibrationConsent } from '../../hooks/useFaceCalibrationConsent';
import { useMe } from '../../hooks/useMe';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function PrivacySettings() {
  const { me } = useMe();
  const { apiFetch } = useApi();
  const consent = useDeliveryConsent();
  const calibrationConsent = useFaceCalibrationConsent();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Same export path as PolicyAcceptanceDialog: fetch the bundle, download it
  // client-side as a single JSON file (no server-side file handling).
  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const bundle = await apiFetch<unknown>('/api/v1/me/export');
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Could not export your data. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-8 text-text">
      <header>
        <h1 className="text-lg font-semibold text-text">Privacy</h1>
        <p className="mt-1 text-sm text-text-subtle">
          Manage analytics consent, review what you've agreed to, and export
          your data.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-medium text-text">Analytics &amp; consent</h2>
        <div className="mt-3">
          <PrivacyPanel
            active={consent.active}
            busy={consent.busy}
            error={consent.error}
            consentLabel={consent.label}
            onGrant={() => {
              void consent.grant();
            }}
            onRevoke={() => {
              void consent.revoke();
            }}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-text">Consent receipts</h2>
        <dl className="mt-3 space-y-2 text-xs text-text-subtle">
          <div className="flex items-baseline justify-between gap-4">
            <dt>Privacy Policy</dt>
            <dd className="text-text-muted">
              {me?.privacy_accepted_version
                ? `v${me.privacy_accepted_version} · ${formatDate(me.privacy_accepted_at)}`
                : 'Not recorded'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt>Terms of Service</dt>
            <dd className="text-text-muted">
              {me?.terms_accepted_version
                ? `v${me.terms_accepted_version} · ${formatDate(me.terms_accepted_at)}`
                : 'Not recorded'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt>Delivery analytics</dt>
            <dd className="text-text-muted">
              {consent.active
                ? `v${me?.delivery_analytics_consent_version} · ${formatDate(me?.delivery_analytics_consent_at)}`
                : 'Off'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt>Camera calibration</dt>
            <dd className="flex items-baseline gap-3 text-text-muted">
              {calibrationConsent.active ? (
                <>
                  <span>
                    {`v${me?.face_calibration_consent_version} · ${formatDate(me?.face_calibration_consent_at)}`}
                  </span>
                  {/* No grant here — granting requires the /calibrate camera
                      capture. Revoke also clears the local baseline. */}
                  <button
                    type="button"
                    disabled={calibrationConsent.busy}
                    onClick={() => {
                      void calibrationConsent.revoke();
                    }}
                    className="cursor-pointer text-text underline underline-offset-4 transition-colors hover:text-text-muted disabled:cursor-default disabled:opacity-60"
                  >
                    Revoke
                  </button>
                </>
              ) : (
                'Off'
              )}
            </dd>
          </div>
        </dl>
        {calibrationConsent.error && (
          <p role="alert" className="mt-2 text-xs text-text">
            {calibrationConsent.error}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-text">Your data</h2>
        <p className="mt-1 text-xs leading-5 text-text-subtle">
          Download everything we store about you — profile, sessions,
          transcripts, scores, and consent records — as a single JSON file.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={exporting}
          onClick={() => {
            void handleExport();
          }}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden />
          {exporting ? 'Preparing…' : 'Export my data'}
        </Button>
        {exportError && (
          <p role="alert" className="mt-2 text-xs text-text">
            {exportError}
          </p>
        )}
      </section>
    </div>
  );
}
