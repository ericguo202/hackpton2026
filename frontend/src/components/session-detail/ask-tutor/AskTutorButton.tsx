/**
 * Ask Tutor launcher — the per-turn-card entry point.
 *
 * A quiet bordered pill (matching SaveQuestionButton's vocabulary) with an
 * amber Sparkles glyph that signals the AI helper without spending the cherry
 * action accent (reserved for the one primary action + the bottom-right
 * feedback FAB). Renders nothing when no AskTutor provider is mounted, so it
 * is inert anywhere the feature isn't wired.
 *
 * `disabled` greys it out while a turn is still being scored (the Practice
 * post-session view) — there's no feedback to discuss yet, so blocking entry
 * here avoids spending tutor tokens + the user's daily chat quota on an empty
 * context. Defaults to false, so the SessionDetail history panel is unchanged.
 */

import { Sparkles } from 'lucide-react';

import { useAskTutor } from './_askTutor';

export default function AskTutorButton({ disabled = false }: { disabled?: boolean }) {
  const tutor = useAskTutor();
  if (!tutor) return null;

  const active = tutor.status !== 'closed';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (tutor.status === 'minimized' ? tutor.restore() : tutor.open())}
      aria-haspopup="dialog"
      aria-expanded={tutor.status === 'open'}
      aria-disabled={disabled || undefined}
      title={disabled ? 'Available once scoring finishes' : 'Ask the tutor about this turn'}
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
        (disabled
          ? 'cursor-not-allowed border-border bg-surface-sunken text-text-muted/50'
          : active
            ? 'border-border-strong bg-surface-sunken text-text'
            : 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:text-text')
      }
    >
      <Sparkles aria-hidden className="h-3.5 w-3.5 text-amber-deep" />
      Ask Tutor
    </button>
  );
}
