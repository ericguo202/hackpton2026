/**
 * AdvancedPanel — shared content for the Home setup screen's "Advanced"
 * surface. Rendered inside the desktop popover (`AdvancedPanelPopover`)
 * and inside the mobile Advanced tab in `Home.tsx`.
 *
 * Purely presentational: all config state lives in `Home.tsx`. Adding a
 * new advanced field = adding a new prop + a new <Section> below; the
 * wrappers don't need to change.
 */

import type { ReactNode } from 'react';

import VoicePickerGrid from './VoicePickerGrid';

type Props = {
  voiceId: string | null;
  onVoiceSelect: (id: string | null) => void;
  showQuestionText: boolean;
  onToggleShowQuestionText: () => void;
  disabled: boolean;
};

export default function AdvancedPanel({
  voiceId,
  onVoiceSelect,
  showQuestionText,
  onToggleShowQuestionText,
  disabled,
}: Props) {
  return (
    <div className="space-y-6">
      <Section
        label="Voice"
        hint="Pick an interviewer accent, or let us choose for you."
      >
        <VoicePickerGrid
          voiceId={voiceId}
          onSelect={onVoiceSelect}
          disabled={disabled}
        />
      </Section>

      <Section
        label="Question text"
        hint="Show the question on screen during your turn. You can also toggle this mid-session."
      >
        <button
          type="button"
          onClick={onToggleShowQuestionText}
          disabled={disabled}
          aria-pressed={showQuestionText}
          className={
            showQuestionText
              ? 'rounded-full border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
              : 'cursor-pointer rounded-full border border-border bg-transparent px-4 py-2 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          Show question text: {showQuestionText ? 'On' : 'Off'}
        </button>
      </Section>
    </div>
  );
}

type SectionProps = {
  label: string;
  hint?: string;
  children: ReactNode;
};

function Section({ label, hint, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-sm">
          {label}
        </p>
        {hint && <p className="text-text-subtle text-sm">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
