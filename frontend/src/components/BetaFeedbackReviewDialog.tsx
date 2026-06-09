import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { FlowHoverButton } from './ui/flow-hover-button';

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function BetaFeedbackReviewDialog({
  open,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="beta-review-title"
      className="anim-crossfade fixed inset-0 z-[65] flex items-center justify-center bg-text/45 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface-raised p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Before you submit feedback
        </p>
        <h2 id="beta-review-title" className="mt-2 font-display text-2xl text-text">
          Have you reviewed your results?
        </h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          Please look through your scores, transcript, and coaching notes first.
          Your beta feedback is most useful after you have seen what the product
          gave back.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <FlowHoverButton variant="dark" type="button" onClick={onCancel}>
            Keep reviewing
          </FlowHoverButton>
          <FlowHoverButton type="button" onClick={onConfirm}>
            I reviewed it
          </FlowHoverButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
