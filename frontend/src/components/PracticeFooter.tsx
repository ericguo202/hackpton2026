import type { ButtonHTMLAttributes, ReactNode } from 'react';

import {
  Eye,
  EyeOff,
  LogOut,
  MessageSquare,
  MessageSquareOff,
  RotateCcw,
  Square,
} from 'lucide-react';

import { cn } from '../lib/utils';

interface Props {
  turnNum: number;
  recorderState: 'idle' | 'recording' | 'stopped';
  showQuestionText: boolean;
  showTranscript: boolean;
  canShowTranscript: boolean;
  submitting: boolean;
  spinnerMessage: string;
  canEnd: boolean;
  onEnd: () => void;
  onRestart: () => void;
  onToggleQuestion: () => void;
  onToggleTranscript: () => void;
  onQuit: () => void;
}

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

type FooterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
};

function FooterButton({ icon, label, className, ...rest }: FooterButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        // Mobile: a 48px circular icon-only target (≥ Apple HIG 44pt) so the
        // buttons are easy to hit and not clumped. Desktop (≥900px): a labeled
        // pill.
        'inline-flex h-12 w-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface p-0 text-sm text-text transition',
        'hover:border-border-strong hover:bg-surface-raised',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:border-border',
        'min-[900px]:h-12 min-[900px]:w-auto min-[900px]:px-4',
        className,
      )}
      {...rest}
    >
      <span className="flex h-5 w-5 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <span className="hidden min-[900px]:inline">{label}</span>
    </button>
  );
}

/* Destructive: quitting discards the in-progress session, so this carries the
   danger cherry (white text on cherry, 5.9:1) — the one red action in the
   footer now that End recording wears amber. The confirm step still lives in
   QuitConfirmDialog. */
function QuitButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quit session"
      className={cn(
        'inline-flex h-12 w-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-accent bg-accent p-0 text-sm font-medium text-accent-fg transition',
        'hover:border-accent-hover hover:bg-accent-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised',
        'min-[900px]:h-12 min-[900px]:w-auto min-[900px]:px-5',
      )}
    >
      <LogOut className="h-5 w-5" />
      <span className="hidden min-[900px]:inline">Quit session</span>
    </button>
  );
}

export function PracticeFooter({
  turnNum,
  recorderState,
  showQuestionText,
  showTranscript,
  canShowTranscript,
  submitting,
  spinnerMessage,
  canEnd,
  onEnd,
  onRestart,
  onToggleQuestion,
  onToggleTranscript,
  onQuit,
}: Props) {
  return (
    <footer className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border bg-surface-raised px-3 py-3 min-[600px]:px-4 min-[900px]:h-20 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between min-[900px]:gap-4 min-[900px]:px-10 min-[900px]:py-0">
      <div className="flex items-center gap-4 min-[900px]:gap-6">
        {/* Turn number dropped on mobile to free horizontal space for the
            larger, evenly-spaced button row below. */}
        <span className="hidden whitespace-nowrap text-eyebrow uppercase tracking-eyebrow text-text-muted min-[900px]:inline">
          Turn {turnNum}
        </span>
        <span className="flex items-center gap-2 text-sm">
          {recorderState === 'recording' ? (
            <>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span className="text-text">Recording</span>
            </>
          ) : (
            <span className="text-text-subtle">
              {recorderState === 'idle' ? 'Waiting' : 'Stopped'}
            </span>
          )}
        </span>
      </div>

      {submitting ? (
        <div
          role="status"
          aria-live="polite"
          className="anim-crossfade flex items-center gap-3 text-text-muted"
        >
          <Spinner size={20} />
          <p className="hidden text-sm min-[900px]:block">{spinnerMessage}</p>
        </div>
      ) : (
        <div className="flex w-full items-center justify-between min-[900px]:w-auto min-[900px]:justify-end min-[900px]:gap-3">
          <FooterButton
            icon={<Square />}
            label="End recording"
            onClick={onEnd}
            disabled={!canEnd}
            // Amber (brand garnish) leads this primary action — dark ink on the
            // amber fill (~8.8:1). Ink is the raw scale (`primary-700`), not the
            // `text` token, so it stays dark in dark mode instead of flipping to
            // cream (cream-on-amber would fail contrast). Cherry is reserved for
            // the destructive Quit button below.
            className="border-highlight bg-highlight text-primary-700 hover:border-amber-deep hover:bg-amber-deep"
          />
          <FooterButton
            icon={<RotateCcw />}
            label="Restart turn"
            onClick={onRestart}
          />
          <FooterButton
            icon={showQuestionText ? <EyeOff /> : <Eye />}
            label={showQuestionText ? 'Hide question' : 'Show question'}
            onClick={onToggleQuestion}
          />
          <FooterButton
            icon={showTranscript ? <MessageSquareOff /> : <MessageSquare />}
            label={showTranscript ? 'Hide transcript' : 'Show transcript'}
            onClick={onToggleTranscript}
            disabled={!canShowTranscript}
          />
          <QuitButton onClick={onQuit} />
        </div>
      )}
    </footer>
  );
}
