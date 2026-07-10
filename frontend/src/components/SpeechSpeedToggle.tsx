/**
 * SpeechSpeedToggle — the "Normal"/"Slower" interview-voice pace control,
 * shared between the Home "Advanced" panel (`AdvancedPanel`) and the
 * re-practice popup (`RePracticeVoiceDialog`).
 *
 * Renders only the segmented control; callers own the surrounding label/hint.
 * The value maps to the backend `speech_speed` (→ ElevenLabs
 * `voice_settings.speed`); constants mirror `tts.NORMAL_SPEED`/`SLOWER_SPEED`.
 */

// "Normal" is a deliberate 1.1 (not 1.0): without voice_settings ElevenLabs
// uses each voice's stored, slower settings. "Slower" (0.9) is aimed at
// non-native English speakers.
export const SPEECH_SPEED_NORMAL = 1.1;
export const SPEECH_SPEED_SLOWER = 0.9;

type Props = {
  speechSpeed: number;
  onChange: (speed: number) => void;
  disabled?: boolean;
};

export default function SpeechSpeedToggle({
  speechSpeed,
  onChange,
  disabled = false,
}: Props) {
  const options: { label: string; value: number }[] = [
    { label: 'Normal', value: SPEECH_SPEED_NORMAL },
    { label: 'Slower', value: SPEECH_SPEED_SLOWER },
  ];
  return (
    <div
      role="group"
      aria-label="Voice pace"
      className="inline-flex rounded-full border border-border bg-surface-sunken p-0.5"
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
  );
}
