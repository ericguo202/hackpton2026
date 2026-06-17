/**
 * "Ask about this" — the contextual deep-link rendered under each Improvement
 * Moment. Presentational only: the parent card decides whether to render it
 * (gated on an AskTutor provider) and wires `onClick` to `openAbout(snippet)`.
 */

import { Sparkles } from 'lucide-react';

export default function AskAboutThisButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full text-xs text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <Sparkles aria-hidden className="h-3 w-3 text-amber-deep" />
      Ask about this
    </button>
  );
}
