/**
 * VoicePickerGrid — the interviewer-voice tile grid, shared between the
 * Home "Advanced" panel (`AdvancedPanel`) and the re-practice popup
 * (`RePracticeVoiceDialog`).
 *
 * Purely presentational: selection state lives in the parent. `null` is the
 * "Surprise me" choice — no `voice_id` is sent, so the backend picks a voice
 * deterministically from the session UUID.
 */

import type { ReactNode } from 'react';

import { VOICE_PROFILES } from '../lib/voices';

type Props = {
  voiceId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
};

export default function VoicePickerGrid({ voiceId, onSelect, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <VoiceTile
        active={voiceId === null}
        disabled={disabled}
        onClick={() => onSelect(null)}
      >
        Surprise me
      </VoiceTile>
      {VOICE_PROFILES.map((voice) => {
        const active = voice.id === voiceId;
        return (
          <VoiceTile
            key={voice.id}
            active={active}
            disabled={disabled}
            onClick={() => onSelect(voice.id)}
          >
            <span>{voice.name}</span>
            <span className={active ? 'ml-1.5 opacity-75' : 'ml-1.5 text-text-subtle'}>
              {voice.accent}
            </span>
          </VoiceTile>
        );
      })}
    </div>
  );
}

type VoiceTileProps = {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
};

function VoiceTile({ active, disabled, onClick, children }: VoiceTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
          : 'cursor-pointer rounded-full border border-border bg-transparent px-4 py-2 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      {children}
    </button>
  );
}
