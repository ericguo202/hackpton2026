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
        'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 text-sm text-text transition',
        'hover:border-border-strong hover:bg-surface-raised',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:border-border',
        'min-[600px]:h-10 min-[600px]:px-3.5 min-[900px]:px-4',
        className,
      )}
      {...rest}
    >
      <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span className="hidden min-[900px]:inline">{label}</span>
    </button>
  );
}

/* Neutral on purpose: cherry in this footer belongs to the recording
   indicator + "End recording" (one action per surface). The destructive
   cherry lives on the confirm button inside QuitConfirmDialog. */
function QuitButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quit session"
      className={cn(
        'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-medium text-text transition',
        'hover:border-border-strong hover:bg-surface-raised',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised',
        'min-[600px]:h-11 min-[600px]:px-3.5 min-[900px]:h-12 min-[900px]:px-5',
      )}
    >
      <LogOut className="h-4 w-4" />
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
    <footer className="flex h-20 shrink-0 items-center justify-between gap-4 border-t border-border bg-surface-raised px-3 min-[600px]:px-4 min-[900px]:px-10">
      <div className="flex items-center gap-4 min-[900px]:gap-6">
        <span className="whitespace-nowrap text-eyebrow uppercase tracking-eyebrow text-text-muted">
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
        <div className="flex items-center gap-1.5 min-[600px]:gap-2 min-[900px]:gap-3">
          <FooterButton
            icon={<Square />}
            label="End recording"
            onClick={onEnd}
            disabled={!canEnd}
            className="border-accent bg-accent text-accent-fg hover:border-accent-hover hover:bg-accent-hover"
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
