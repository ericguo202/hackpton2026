/**
 * Ask Tutor launcher — the per-turn-card entry point.
 *
 * A quiet bordered pill (matching SaveQuestionButton's vocabulary) with an
 * amber Sparkles glyph that signals the AI helper without spending the cherry
 * action accent (reserved for the one primary action + the bottom-right
 * feedback FAB). Renders nothing when no AskTutor provider is mounted, so it
 * is inert anywhere the feature isn't wired.
 */

import { Sparkles } from 'lucide-react';

import { useAskTutor } from './_askTutor';

export default function AskTutorButton() {
  const tutor = useAskTutor();
  if (!tutor) return null;

  const active = tutor.status !== 'closed';

  return (
    <button
      type="button"
      onClick={() => (tutor.status === 'minimized' ? tutor.restore() : tutor.open())}
      aria-haspopup="dialog"
      aria-expanded={tutor.status === 'open'}
      title="Ask the tutor about this turn"
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
        (active
          ? 'border-border-strong bg-surface-sunken text-text'
          : 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:text-text')
      }
    >
      <Sparkles aria-hidden className="h-3.5 w-3.5 text-amber-deep" />
      Ask Tutor
    </button>
  );
}
