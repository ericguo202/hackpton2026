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

import DeliveryConsentBullets from './DeliveryConsentBullets';
import { FlowHoverButton } from './ui/flow-hover-button';

type Props = {
  active: boolean;
  busy: boolean;
  error: string | null;
  consentLabel: string | null;
  onGrant: () => void;
  onRevoke: () => void;
};

export default function PrivacyPanel({
  active,
  busy,
  error,
  consentLabel,
  onGrant,
  onRevoke,
}: Props) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-4">
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
        <div className="rounded border border-border bg-surface-sunken px-3 py-3">
          <p className="text-xs font-medium text-text">
            {consentLabel ?? 'Delivery analytics consent is active'}
          </p>
          <p className="mt-1 text-xs leading-5 text-text-subtle">
            Deleting disables future camera delivery summaries and removes stored
            delivery summaries, delivery scores, and delivery-specific coaching
            from completed history.
          </p>
          <FlowHoverButton
            type="button"
            disabled={busy}
            onClick={onRevoke}
            icon={<Trash2 className="h-4 w-4" aria-hidden />}
            className="mt-3"
          >
            Delete delivery analytics
          </FlowHoverButton>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded border border-border bg-surface-sunken px-3 py-3 text-xs leading-5 text-text-subtle">
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
          <FlowHoverButton
            type="button"
            variant="dark"
            disabled={!checked || busy}
            onClick={onGrant}
            icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          >
            Enable delivery analytics
          </FlowHoverButton>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs leading-5 text-text">
          {error}
        </p>
      )}
    </div>
  );
}
