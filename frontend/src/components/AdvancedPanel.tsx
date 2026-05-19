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

import { VOICE_PROFILES } from '../lib/voices';

type Props = {
  voiceId: string | null;
  onVoiceSelect: (id: string | null) => void;
  disabled: boolean;
};

export default function AdvancedPanel({ voiceId, onVoiceSelect, disabled }: Props) {
  return (
    <div className="space-y-6">
      <Section
        label="Voice"
        hint="Pick an interviewer accent, or let us choose for you."
      >
        <div className="flex flex-wrap gap-2">
          <VoiceTile
            active={voiceId === null}
            disabled={disabled}
            onClick={() => onVoiceSelect(null)}
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
                onClick={() => onVoiceSelect(voice.id)}
              >
                <span>{voice.name}</span>
                <span className={active ? 'ml-1.5 opacity-75' : 'ml-1.5 text-text-subtle'}>
                  {voice.accent}
                </span>
              </VoiceTile>
            );
          })}
        </div>
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
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-[13px]">
          {label}
        </p>
        {hint && <p className="text-text-subtle text-sm">{hint}</p>}
      </div>
      {children}
    </section>
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
          ? 'rounded-full border border-accent bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
          : 'cursor-pointer rounded-full border border-border bg-transparent px-4 py-2 text-[13px] text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      {children}
    </button>
  );
}
