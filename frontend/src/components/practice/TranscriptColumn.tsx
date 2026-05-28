import { X } from 'lucide-react';

import { cn } from '../../lib/utils';

interface Props {
  question: string;
  transcript: string;
  /**
   * Close handler invoked by the desktop X button. The button is hidden on
   * mobile via responsive classes; on mobile the user toggles visibility
   * from the footer instead.
   */
  onClose: () => void;
  className?: string;
}

export function TranscriptColumn({ question, transcript, onClose, className }: Props) {
  return (
    <aside
      aria-label="Previous answer"
      className={cn(
        // Mobile: top border separates the transcript from the camera box
        // stacked above it. Desktop: drop the top border and use a left
        // border instead, since the transcript becomes its own column.
        'flex flex-col border-t border-border p-6',
        'min-[900px]:h-full min-[900px]:overflow-hidden min-[900px]:border-t-0 min-[900px]:border-l min-[900px]:p-8',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Previous answer
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close transcript"
          className="hidden rounded p-1 text-text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface min-[900px]:inline-flex"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 flex-1 space-y-5 overflow-y-auto pr-2">
        <div>
          <p className="mb-2 text-eyebrow uppercase tracking-eyebrow text-text-subtle">
            Question
          </p>
          <p className="text-sm leading-relaxed text-text-muted">{question}</p>
        </div>
        <div>
          <p className="mb-2 text-eyebrow uppercase tracking-eyebrow text-text-subtle">
            Your answer
          </p>
          <p className="text-sm leading-relaxed text-text">{transcript}</p>
        </div>
      </div>
    </aside>
  );
}
