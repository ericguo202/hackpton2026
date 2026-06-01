/**
 * SpeechToTextButton — optional voice dictation for a bio textarea.
 *
 * Reused by OnboardingForm (step 3) and Personalize so both bio fields offer
 * the same mic. Self-contained: it owns the mic toggle, the live greyed interim
 * preview, and the permission-error notice. It does NOT own the bio value —
 * each form merges finalized phrases into its own controlled state via
 * `onAppend` (see `lib/joinSpoken` for the spacing + 2000-char clamp helper).
 *
 * Renders nothing when the Web Speech API is unavailable (e.g. Firefox), so the
 * textarea degrades to plain typing.
 */

import { Mic, Square } from 'lucide-react';

import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

type Props = {
  onAppend: (text: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
};

export default function SpeechToTextButton({
  onAppend,
  disabled,
  ariaLabel = 'Dictate with your voice',
}: Props) {
  const { supported, listening, interim, error, toggle } = useSpeechRecognition({
    onResult: onAppend,
  });

  if (!supported) return null;

  const buttonClass =
    'inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-surface disabled:opacity-50 ' +
    'disabled:cursor-not-allowed ' +
    (listening
      ? 'border-accent bg-accent text-accent-fg hover:bg-accent-hover'
      : 'border-border bg-surface-raised text-text-muted hover:text-text');

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? 'Stop dictation' : ariaLabel}
        className={buttonClass}
      >
        {listening ? (
          <Square aria-hidden="true" className="h-4 w-4 animate-pulse" />
        ) : (
          <Mic aria-hidden="true" className="h-4 w-4" />
        )}
        <span>{listening ? 'Stop' : 'Dictate'}</span>
      </button>

      {listening && (
        <p className="text-sm text-text-subtle">
          {interim ? interim : 'Listening… speak now.'}
        </p>
      )}

      {error && <p className="text-sm text-text-muted">{error}</p>}
    </div>
  );
}
