/**
 * Signed-in home — Setup phase only.
 *
 * Asks "Which company are you interviewing with?" and starts the session.
 * On submit:
 *   - verifies microphone access (fast preflight; release tracks immediately)
 *   - POST /api/v1/sessions to create the session and fetch the first question
 *   - navigate to /practice with the session id + first question in state
 *
 * The active interview (recording, scoring, results) lives in `Practice.tsx`,
 * mounted at `/practice`.
 */

import { useState, type FormEvent } from 'react';
import { UserButton, useUser } from '@clerk/react';
import { ImageDithering } from '@paper-design/shaders-react';
import { useNavigate } from 'react-router';

import FlashBanner from '../components/FlashBanner';
import ScoreDimensions from '../components/ScoreDimensions';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useApi } from '../hooks/useApi';
import { useLocalStoragePref } from '../hooks/useLocalStoragePref';
import { useMe } from '../hooks/useMe';
import { ApiError } from '../lib/api';
import { VOICE_PROFILES, type VoiceProfile } from '../lib/voices';
import type { PracticeLocationState } from './Practice';

type SessionStart = {
  session_id: string;
  summary: { description: string; headlines: string[]; values: string[] };
  first_question: string;
  first_question_audio_url: string;
};

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

/**
 * Disclosure-style voice picker for the start form.
 *
 * Collapsed by default — most candidates skip it and accept the
 * server-side deterministic fallback derived from the session UUID.
 * `selectedId === null` means "let the backend pick" — the helper line
 * reads "Surprise me." in that case.
 */
function VoicePicker({
  selectedId,
  onSelect,
  disabled,
  autoSubmit,
  onToggleAutoSubmit,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled: boolean;
  autoSubmit: boolean;
  onToggleAutoSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);

  const selected: VoiceProfile | null =
    VOICE_PROFILES.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="anim-reveal mt-8 max-w-[42rem]" style={{ animationDelay: '200ms' }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={disabled}
          aria-expanded={open}
          className="text-text-muted cursor-pointer underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {open ? 'Hide interviewer voice (accent)' : 'Choose interviewer voice (accent)'}
        </button>
        <span className="text-text-subtle">
          {selected
            ? `${selected.name} (${selected.accent})`
            : 'Surprise me'}
        </span>
        <button
          type="button"
          onClick={onToggleAutoSubmit}
          disabled={disabled}
          aria-pressed={autoSubmit}
          className={
            autoSubmit
              ? 'rounded-full border border-accent bg-accent px-3 py-1 text-[12px] font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
              : 'cursor-pointer rounded-full border border-border bg-transparent px-3 py-1 text-[12px] text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          Auto-submit: {autoSubmit ? 'On' : 'Off'}
        </button>
      </div>

      {open && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelect(null)}
              disabled={disabled}
              aria-pressed={selected === null}
              className={
                selected === null
                  ? 'rounded-full border border-accent bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                  : 'cursor-pointer rounded-full border border-border bg-transparent px-4 py-2 text-[13px] text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              Surprise me
            </button>
            {VOICE_PROFILES.map((voice) => {
              const active = voice.id === selectedId;
              return (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => onSelect(voice.id)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={
                    active
                      ? 'rounded-full border border-accent bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
                      : 'cursor-pointer rounded-full border border-border bg-transparent px-4 py-2 text-[13px] text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
                  }
                >
                  <span>{voice.name}</span>
                  <span className={active ? 'ml-1.5 opacity-75' : 'ml-1.5 text-text-subtle'}>
                    {voice.accent}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useUser();
  const { me } = useMe();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  const [company, setCompany] = useState('');
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  // Persisted across sessions; Practice.tsx reads the same key for its
  // auto-submit effect.
  const [autoSubmit, setAutoSubmit] = useLocalStoragePref('auto_submit_enabled', false);

  const firstName = user?.firstName ?? null;

  async function handleStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = company.trim();
    if (!trimmed) return;

    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setSetupError('Microphone access is required. Please allow mic access and try again.');
      return;
    }

    setSubmitting(true);
    setSetupError(null);
    try {
      const data = await apiFetch<SessionStart>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          company: trimmed,
          job_title: me?.target_role ?? 'Software Engineer',
          ...(voiceId ? { voice_id: voiceId } : {}),
        }),
      });
      const state: PracticeLocationState = {
        sessionId: data.session_id,
        firstQuestion: data.first_question,
        firstQuestionAudioUrl: data.first_question_audio_url,
      };
      navigate('/practice', { state });
    } catch (err) {
      setSetupError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : (err as Error).message,
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink to="/" matchPatterns={['/practice']}>
              Practice
            </TopBarNavLink>
            <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']}>
              History
            </TopBarNavLink>
            <TopBarNavLink to="/personalize">
              Personalize
            </TopBarNavLink>
          </>
        }
        rightSlot={<UserButton />}
      />

      <FlashBanner />

      <main className="flex-1">
        <div className="relative flex min-h-full items-center overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none hidden xl:block absolute inset-y-0 right-0 aspect-[563/484] bg-[#17150F] overflow-hidden"
            style={{
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 85%)',
              maskImage:
                'linear-gradient(to right, transparent 0%, black 85%)',
            }}
          >
            <ImageDithering
              originalColors={false}
              inverted={false}
              type="8x8"
              size={2.5}
              colorSteps={2}
              image="/home-sculpture.png"
              scale={1}
              fit="cover"
              colorBack="#00000000"
              colorFront="#F1E9D2"
              colorHighlight="#EAFF94"
              className="absolute inset-0 w-full h-full"
            />
          </div>

          <form
            onSubmit={handleStart}
            className="relative z-10 mx-auto w-full max-w-[80rem] px-8 py-16 md:px-16 md:py-24"
          >
            <div className="max-w-[54rem]">
              <p
                className="anim-reveal mb-10 text-eyebrow uppercase tracking-eyebrow text-text-muted md:mb-12"
                style={{ animationDelay: '0ms' }}
              >
                Good {timeOfDay()}{firstName ? `, ${firstName}` : ''}
              </p>

              <h1
                className="anim-reveal mb-10 font-display font-medium leading-[1.05] tracking-[-0.02em] text-text md:mb-12"
                style={{ animationDelay: '80ms', fontSize: 'clamp(2.25rem, 5vw, 4.25rem)' }}
              >
                Which company are you
                <br />
                interviewing with?
              </h1>

              <label className="anim-reveal block max-w-[42rem]" style={{ animationDelay: '160ms' }}>
                <span className="sr-only">Company name</span>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Jane Street, Figma, Anthropic..."
                  autoComplete="off"
                  autoFocus
                  disabled={submitting}
                  className="w-full border-0 border-b border-border-strong bg-transparent pb-3 pt-1 font-display text-2xl font-medium text-text placeholder:font-display placeholder:font-normal placeholder:text-text-subtle focus:border-accent focus:outline-none disabled:opacity-50 md:text-4xl"
                />
              </label>

              <VoicePicker
                selectedId={voiceId}
                onSelect={setVoiceId}
                disabled={submitting}
                autoSubmit={autoSubmit}
                onToggleAutoSubmit={() => setAutoSubmit((v) => !v)}
              />

              <div
                className="anim-reveal mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-4"
                style={{ animationDelay: '280ms' }}
              >
                <FlowHoverButton
                  type="submit"
                  disabled={!company.trim() || submitting}
                >
                  {submitting ? 'Starting...' : 'Begin session'}
                </FlowHoverButton>

                {me?.target_role && (
                  <p className="text-[13px] text-text-subtle">
                    Target role: <span className="text-text-muted">{me.target_role}</span>
                  </p>
                )}
              </div>

              {setupError && (
                <p role="alert" aria-live="polite" className="mt-10 text-sm leading-[1.6] text-text-muted">
                  <span className="mr-3 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
                  {setupError}
                </p>
              )}
            </div>
          </form>
        </div>
      </main>

      <ScoreDimensions tagline="One opening question. One follow-up. Then the scores." />
    </div>
  );
}
