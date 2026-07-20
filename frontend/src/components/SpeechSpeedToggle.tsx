/**
 * SpeechSpeedToggle — the "Normal"/"Slower" interview-voice pace control,
 * shared between the Home "Advanced" panel (`AdvancedPanel`) and the
 * re-practice popup (`RePracticeVoiceDialog`).
 *
 * Renders only the segmented control; callers own the surrounding label/hint.
 * The value is a semantic pace label (→ backend `speech_pace`), NOT a raw
 * speed. The actual ElevenLabs `voice_settings.speed` is resolved PER VOICE
 * server-side (`voice_pool.resolve_speed`), because a global 1.1/0.9 reads
 * very differently across accents — and on "Surprise me" the frontend can't
 * even know which voice will be picked.
 */

export type SpeechPace = 'normal' | 'slower';

// "Normal" is the brisk default; "Slower" is aimed at non-native English
// speakers. The per-voice float each maps to lives on the backend.
export const SPEECH_PACE_DEFAULT: SpeechPace = 'normal';

type Props = {
  pace: SpeechPace;
  onChange: (pace: SpeechPace) => void;
  disabled?: boolean;
};

export default function SpeechSpeedToggle({
  pace,
  onChange,
  disabled = false,
}: Props) {
  const options: { label: string; value: SpeechPace }[] = [
    { label: 'Normal', value: 'normal' },
    { label: 'Slower', value: 'slower' },
  ];
  return (
    <div
      role="group"
      aria-label="Voice pace"
      className="inline-flex rounded-full border border-border bg-surface-sunken p-0.5"
    >
      {options.map(({ label, value }) => {
        const active = pace === value;
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
  );
}
