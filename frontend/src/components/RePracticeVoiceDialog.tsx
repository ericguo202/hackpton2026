/**
 * RePracticeVoiceDialog — voice picker popup shown before re-practicing a
 * saved opening question. Lets the user choose an interviewer accent (or keep
 * "Surprise me", the deterministic-random default), then launch or cancel.
 *
 * Modeled on `QuitConfirmDialog`: backdrop modal, click-outside + Escape to
 * cancel, semantic tokens throughout so dark mode flips for free. Selection
 * state is local and resets to `null` ("Surprise me") each time it opens, so
 * the no-op default matches today's behavior.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import VoicePickerGrid from './VoicePickerGrid';
import { Button } from './ui/button';

interface Props {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onStart: (voiceId: string | null) => void;
  questionText?: string;
}

export default function RePracticeVoiceDialog({
  open,
  busy,
  onCancel,
  onStart,
  questionText,
}: Props) {
  const [voiceId, setVoiceId] = useState<string | null>(null);

  // Reset to "Surprise me" on each open transition, via the React-19
  // compare-state-during-render pattern (no setState-in-effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setVoiceId(null);
  }

  // Escape cancels — but not while a launch is in flight.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  // Portal to <body> so the `fixed inset-0` backdrop covers the full viewport.
  // Both mount points (the History saved-questions `<section>` carries an
  // `anim-reveal` transform) sit inside a transformed ancestor, which would
  // otherwise become the containing block for `position: fixed`.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="repractice-voice-title"
      className="anim-crossfade fixed inset-0 z-50 overflow-y-auto bg-text/40 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface-raised p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="repractice-voice-title" className="font-display text-xl text-text">
          Choose an interviewer voice
        </h3>
        {questionText && (
          <p className="mt-3 text-sm leading-relaxed text-text-muted line-clamp-3">
            {questionText}
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-text-subtle">
          Pick an accent for this attempt, or let us choose for you.
        </p>

        <div className="mt-5">
          <VoicePickerGrid voiceId={voiceId} onSelect={setVoiceId} disabled={busy} />
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <Button
            variant="outline"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onStart(voiceId)}
            disabled={busy}
          >
            {busy ? 'Starting…' : 'Start session'}
          </Button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
