import { useEffect } from 'react';

import { Button } from './ui/button';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function QuitConfirmDialog({ open, onCancel, onConfirm }: Props) {
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
      aria-labelledby="quit-title"
      className="anim-crossfade fixed inset-0 z-50 flex items-center justify-center bg-text/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 max-w-md rounded-2xl border border-border bg-surface-raised p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="quit-title" className="font-display text-xl text-text">
          Quit this session?
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          Your progress won&apos;t be scored. This session won&apos;t count toward your daily limit.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={onCancel}>
            Keep going
          </Button>
          {/* Destructive reuses cherry deliberately (DESIGN.md §5); the
              label, not a new color, carries the meaning. */}
          <Button variant="destructive" type="button" onClick={onConfirm}>
            Quit session
          </Button>
        </div>
      </div>
    </div>
  );
}
