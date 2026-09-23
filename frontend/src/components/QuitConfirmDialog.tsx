import { useEffect } from 'react';

import { Button } from './ui/button';

interface Props {
  open: boolean;
  /**
   * Number of turns the candidate has already completed. When ≥ 1 the quit is
   * a graded early-end (the session is kept and scored on those turns); when 0
   * it's a plain abandon with no record. Drives the dialog copy + action.
   */
  completedTurns: number;
  /** Disables the buttons + shows "Saving…" while the early-end request runs. */
  busy?: boolean;
  /** Surfaced in the dialog when the early-end request fails (dialog stays open). */
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function QuitConfirmDialog({ open, completedTurns, busy, error, onCancel, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, busy]);

  if (!open) return null;

  const hasProgress = completedTurns >= 1;
  const turnLabel = completedTurns === 1 ? 'turn' : 'turns';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quit-title"
      className="anim-crossfade fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="mx-4 max-w-md rounded-2xl border border-border bg-surface-raised p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="quit-title" className="font-display text-xl text-text">
          {hasProgress ? 'End this session early?' : 'Quit this session?'}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          {hasProgress ? (
            <>
              You&apos;ve completed {completedTurns} {turnLabel}. We&apos;ll score this
              session on {completedTurns === 1 ? 'that turn' : 'those turns'} and save it
              to your history so you can review your feedback. The {turnLabel} you
              answered are already counted; you won&apos;t be charged for the ones you
              skip.
            </>
          ) : (
            <>Your progress won&apos;t be scored. Nothing is charged until you answer a question, so this session won&apos;t count toward your limits.</>
          )}
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm leading-relaxed text-cherry-glaze">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={onCancel} disabled={busy}>
            Keep going
          </Button>
          {/* Destructive reuses cherry deliberately (DESIGN.md §5); the
              label, not a new color, carries the meaning. */}
          <Button variant="destructive" type="button" onClick={onConfirm} disabled={busy}>
            {hasProgress ? (busy ? 'Saving…' : 'End & save') : 'Quit session'}
          </Button>
        </div>
      </div>
    </div>
  );
}
