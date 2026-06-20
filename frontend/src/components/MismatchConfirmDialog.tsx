/**
 * MismatchConfirmDialog — shown when the backend flags that the candidate's
 * target role / industry / company may not match the pasted job description
 * (HTTP 409 from POST /sessions). Confirming re-submits with
 * `acknowledge_mismatch: true`, which skips the server-side match-check.
 */

import { useEffect } from 'react';

import { Button } from './ui/button';

interface Props {
  open: boolean;
  message: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MismatchConfirmDialog({ open, message, busy, onCancel, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mismatch-title"
      className="anim-crossfade fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 max-w-md rounded-2xl border border-border bg-surface-raised p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="mismatch-title" className="font-display text-xl text-text">
          Double-check this job description
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          {message}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-subtle">
          You can continue anyway, or go back and adjust your target role,
          industry, company, or the pasted description.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={onCancel} disabled={busy}>
            Go back
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Starting...' : 'Continue anyway'}
          </Button>
        </div>
      </div>
    </div>
  );
}
