/**
 * CalibrationConsentDialog — blocking consent gate shown on `/calibrate` when
 * the browser has no active calibration consent.
 *
 * Accept → record local consent + stay on the calibration page. Reject → leave
 * (the page redirects to `/`). Unlike `DeliveryConsentDialog`, this gate is NOT
 * dismissible by backdrop click or Escape: there is no valid "stay un-gated"
 * state, since the page requires consent before the camera can be enabled.
 *
 * Modeled on `DeliveryConsentDialog`: portal to <body>, backdrop, checkbox
 * reset on open (React-19 compare-during-render). No `busy` — the consent write
 * is synchronous localStorage.
 */

import { ScanFace, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import CalibrationConsentBullets from './CalibrationConsentBullets';
import { Button } from './ui/button';

interface Props {
  open: boolean;
  error: string | null;
  onConsent: () => void;
  onReject: () => void;
}

export default function CalibrationConsentDialog({
  open,
  error,
  onConsent,
  onReject,
}: Props) {
  const [checked, setChecked] = useState(false);

  // Reset the checkbox on each open transition (no setState-in-effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChecked(false);
  }

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calibration-consent-title"
      className="anim-crossfade fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-raised p-8 shadow-2xl">
        <div className="flex items-start gap-3">
          <ScanFace
            className="mt-0.5 h-5 w-5 shrink-0 text-text-muted"
            aria-hidden
          />
          <div>
            <h3
              id="calibration-consent-title"
              className="font-display text-xl text-text"
            >
              Calibration privacy notice and consent
            </h3>
            <p className="mt-2 text-sm leading-6 text-text-subtle">
              Calibration is optional. Read this notice before enabling the
              camera.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <CalibrationConsentBullets />
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded border border-border bg-surface-sunken px-3 py-3 text-xs leading-5 text-text-subtle">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.currentTarget.checked)}
            className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
          />
          <span>
            I have read this notice, am authorized to consent, and consent to
            local camera-based calibration processing for the purpose stated
            above.
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-xs leading-5 text-text">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={onReject}>
            Don&rsquo;t allow &mdash; leave
          </Button>
          <Button type="button" onClick={onConsent} disabled={!checked}>
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
            Accept and continue
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
