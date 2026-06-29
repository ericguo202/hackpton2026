/**
 * DeliveryConsentDialog — blocking consent popup shown on "Begin session" when
 * the user has no active delivery-analytics consent.
 *
 * Consent → record consent + start the session + (in Practice) the webcam is
 * enabled. Decline → start the session voice-only (consent is NOT a condition
 * of using the product). Cancel/ESC/backdrop → abort, no session.
 *
 * Modeled on `RePracticeVoiceDialog`: portal to <body>, backdrop, Escape to
 * cancel, `busy` guard, checkbox reset on open (React-19 compare-during-render).
 */

import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import DeliveryConsentBullets from './DeliveryConsentBullets';
import { Button } from './ui/button';

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  onConsent: () => void;
  onDecline: () => void;
  onCancel: () => void;
}

export default function DeliveryConsentDialog({
  open,
  busy,
  error,
  onConsent,
  onDecline,
  onCancel,
}: Props) {
  const [checked, setChecked] = useState(false);

  // Reset the checkbox on each open transition (no setState-in-effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChecked(false);
  }

  // Escape cancels — but not while a request is in flight.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-consent-title"
      className="anim-crossfade fixed inset-0 z-50 overflow-y-auto bg-text/40 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface-raised p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-text-muted"
            aria-hidden
          />
          <div>
            <h3
              id="delivery-consent-title"
              className="font-display text-xl text-text"
            >
              Enable camera-based delivery feedback?
            </h3>
            <p className="mt-2 text-sm leading-6 text-text-subtle">
              Before your session, choose whether we may use your camera to score
              your on-screen delivery. This is optional — you can practice
              without it.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <DeliveryConsentBullets />
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded border border-border bg-surface-sunken px-3 py-3 text-xs leading-5 text-text-subtle">
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

        {error && (
          <p role="alert" className="mt-3 text-xs leading-5 text-text">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onDecline}
            disabled={busy}
          >
            Continue without camera
          </Button>
          <Button
            type="button"
            onClick={onConsent}
            disabled={!checked || busy}
          >
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
            {busy ? 'Saving…' : 'Enable camera & consent'}
          </Button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
