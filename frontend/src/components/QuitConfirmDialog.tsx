import { useEffect } from 'react';

import { FlowHoverButton } from './ui/flow-hover-button';

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
        className="mx-4 max-w-md rounded-2xl border border-border bg-surface-raised p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="quit-title" className="font-display text-xl text-text">
          Quit this session?
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          Your progress won&apos;t be scored. This session won&apos;t count toward your daily limit.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <FlowHoverButton variant="dark" type="button" onClick={onCancel}>
            Keep going
          </FlowHoverButton>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
          >
            Quit session
          </button>
        </div>
      </div>
    </div>
  );
}
