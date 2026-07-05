/**
 * AdvancedPanel — shared content for the Home setup screen's "Advanced"
 * surface. Rendered inside the desktop popover (`AdvancedPanelPopover`)
 * and inside the mobile Advanced tab in `Home.tsx`.
 *
 * Purely presentational: all config state lives in `Home.tsx`. Adding a
 * new advanced field = adding a new prop + a new <Section> below; the
 * wrappers don't need to change.
 */

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { CONTENT_POLICY_MESSAGE, violatesContentPolicy } from '../lib/contentPolicy';
import type { CustomQuestion } from '../types/customQuestions';
import VoicePickerGrid from './VoicePickerGrid';

// Mirrors the server-side cap in `SessionCreateIn.job_description`.
export const MAX_JOB_DESCRIPTION_CHARS = 6000;
// Show the remaining-characters counter only once the user is close to the cap.
const JOB_DESCRIPTION_COUNTER_THRESHOLD = 500;

// Interview-voice pace, sent to the backend as `speech_speed` (→ ElevenLabs
// `voice_settings.speed`). Mirrors `tts.NORMAL_SPEED`/`SLOWER_SPEED`.
export const SPEECH_SPEED_NORMAL = 1.1;
export const SPEECH_SPEED_SLOWER = 0.9;

const linkClass =
  'font-medium text-accent underline underline-offset-4 transition-colors hover:text-text';

type Props = {
  voiceId: string | null;
  onVoiceSelect: (id: string | null) => void;
  speechSpeed: number;
  onSpeechSpeedChange: (speed: number) => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  customQuestions: CustomQuestion[];
  selectedCustomQuestionId: string | null;
  onSelectCustomQuestion: (id: string | null) => void;
  disabled: boolean;
};

export default function AdvancedPanel({
  voiceId,
  onVoiceSelect,
  speechSpeed,
  onSpeechSpeedChange,
  jobDescription,
  onJobDescriptionChange,
  customQuestions,
  selectedCustomQuestionId,
  onSelectCustomQuestion,
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
        <SpeedToggle
          speechSpeed={speechSpeed}
          onChange={onSpeechSpeedChange}
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
              {CONTENT_POLICY_MESSAGE}
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
        label="Custom question"
        hint={
          <>
            Use one of your own questions instead of a generated one. Manage your
            questions on the{' '}
            <Link to="/personalize#custom-questions" className={linkClass}>
              Personalize
            </Link>{' '}
            page.
          </>
        }
      >
        {customQuestions.length === 0 ? (
          <p className="text-sm text-text-subtle">
            No custom questions yet. Add some on the{' '}
            <Link to="/personalize#custom-questions" className={linkClass}>
              Personalize
            </Link>{' '}
            page.
          </p>
        ) : (
          <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {customQuestions.map((q) => {
              const selected = selectedCustomQuestionId === q.id;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() =>
                      onSelectCustomQuestion(selected ? null : q.id)
                    }
                    className={
                      'flex w-full items-start gap-2 rounded border px-3 py-2 text-left text-sm transition-colors ' +
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ' +
                      'focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
                      'disabled:cursor-not-allowed disabled:opacity-50 ' +
                      (selected
                        ? 'border-accent bg-accent/10 text-text'
                        : 'cursor-pointer border-border bg-surface-sunken text-text-muted hover:border-border-strong hover:text-text')
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ' +
                        (selected
                          ? 'border-accent bg-accent text-accent-fg'
                          : 'border-border-strong')
                      }
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">{q.question_text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selectedCustomQuestionId !== null && (
          <p className="text-xs text-text-subtle">
            Your selected question replaces the opening question. The company you
            enter still tailors the follow-up.
          </p>
        )}
      </Section>
    </div>
  );
}

type SpeedToggleProps = {
  speechSpeed: number;
  onChange: (speed: number) => void;
  disabled: boolean;
};

/**
 * Two-option interview-pace toggle sitting under the voice grid. "Normal" is
 * the brisk 1.1 default; "Slower" (0.9) is aimed at non-native English
 * speakers who want the interviewer to talk more deliberately.
 */
function SpeedToggle({ speechSpeed, onChange, disabled }: SpeedToggleProps) {
  const options: { label: string; value: number }[] = [
    { label: 'Normal', value: SPEECH_SPEED_NORMAL },
    { label: 'Slower', value: SPEECH_SPEED_SLOWER },
  ];
  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Voice pace"
        className="inline-flex rounded-full border border-border bg-surface-raised p-0.5"
      >
        {options.map(({ label, value }) => {
          const active = speechSpeed === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(value)}
              disabled={disabled}
              aria-pressed={active}
              className={
                'rounded-full px-4 py-1.5 text-sm transition-colors ' +
                'focus-visible:outline-none focus-visible:ring-2 ' +
                'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
                'focus-visible:ring-offset-surface ' +
                'disabled:cursor-not-allowed disabled:opacity-50 ' +
                (active
                  ? 'bg-accent font-medium text-accent-fg'
                  : 'cursor-pointer text-text-muted hover:text-text')
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-text-subtle text-sm">
        How fast the interviewer speaks. Slower can help if English isn't your
        first language.
      </p>
    </div>
  );
}

type SectionProps = {
  label: string;
  hint?: ReactNode;
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
