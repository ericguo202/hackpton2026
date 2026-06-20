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

import { violatesContentPolicy } from '../lib/contentPolicy';
import VoicePickerGrid from './VoicePickerGrid';

// Mirrors the server-side cap in `SessionCreateIn.job_description`.
export const MAX_JOB_DESCRIPTION_CHARS = 6000;
// Show the remaining-characters counter only once the user is close to the cap.
const JOB_DESCRIPTION_COUNTER_THRESHOLD = 500;

type Props = {
  voiceId: string | null;
  onVoiceSelect: (id: string | null) => void;
  showQuestionText: boolean;
  onToggleShowQuestionText: () => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  disabled: boolean;
};

export default function AdvancedPanel({
  voiceId,
  onVoiceSelect,
  showQuestionText,
  onToggleShowQuestionText,
  jobDescription,
  onJobDescriptionChange,
  disabled,
}: Props) {
  const remaining = MAX_JOB_DESCRIPTION_CHARS - jobDescription.length;
  const showCounter = remaining <= JOB_DESCRIPTION_COUNTER_THRESHOLD;
  const policyError = jobDescription.trim() !== '' && violatesContentPolicy(jobDescription);

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
        label="Job description"
        hint="Paste a posting to tailor the opening question to this specific role. Optional."
      >
        <textarea
          value={jobDescription}
          onChange={(e) => onJobDescriptionChange(e.target.value)}
          disabled={disabled}
          maxLength={MAX_JOB_DESCRIPTION_CHARS}
          rows={6}
          placeholder="Paste the job description here…"
          aria-invalid={policyError}
          className="h-40 w-full resize-none overflow-y-auto rounded border border-border bg-surface-sunken px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-3">
          {policyError ? (
            <p role="alert" className="text-sm text-critique">
              This content violates our usage policies. Please revise it.
            </p>
          ) : (
            <span />
          )}
          {showCounter && (
            <p
              className={
                remaining <= 0
                  ? 'text-sm text-critique'
                  : 'text-sm text-text-subtle'
              }
            >
              {remaining.toLocaleString()} left
            </p>
          )}
        </div>
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
