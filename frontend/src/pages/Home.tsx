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
 *
 * Layout splits into two slabs at the 900px breakpoint (the same breakpoint
 * TopBar.tsx uses for nav vs hamburger). Desktop keeps the inline form and
 * exposes Advanced as a right-side drawer (`AdvancedPanelDrawer`) that slides
 * in over the sculpture column when the user clicks the "Advanced" trigger
 * next to the Auto-submit pill — the form on the left stays usable. Mobile
 * uses Basic / Advanced pill tabs (matching the resume tabs in Personalize.tsx)
 * sitting alongside Begin session. The Advanced surface is the same
 * `AdvancedPanel` component on both breakpoints.
 */

import { useState, type SubmitEvent } from 'react';
import { UserButton, useUser } from '@clerk/react';
import { ImageDithering } from '@paper-design/shaders-react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';

import AdvancedPanel from '../components/AdvancedPanel';
import AdvancedPanelDrawer from '../components/AdvancedPanelDrawer';
import FlashBanner from '../components/FlashBanner';
import ScoreDimensions from '../components/ScoreDimensions';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useApi } from '../hooks/useApi';
import { useLocalStoragePref } from '../hooks/useLocalStoragePref';
import { useMe } from '../hooks/useMe';
import { ApiError, extractApiErrorDetail } from '../lib/api';
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

const companyInputClass =
  'w-full border-0 border-b border-border-strong bg-transparent pb-3 pt-1 text-2xl font-medium text-text placeholder:font-normal placeholder:text-text-subtle focus:border-accent focus:outline-none disabled:opacity-50 md:text-4xl';

function AutoSubmitPill({
  autoSubmit,
  onToggle,
  disabled,
}: {
  autoSubmit: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
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
  );
}

function ModeTabs({
  mode,
  setMode,
  disabled,
}: {
  mode: 'basic' | 'advanced';
  setMode: (m: 'basic' | 'advanced') => void;
  disabled: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Setup mode"
      className="inline-flex rounded border border-border bg-surface-raised p-0.5"
    >
      {(['basic', 'advanced'] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => setMode(m)}
            className={
              'rounded px-3 py-1.5 text-sm transition-colors ' +
              'focus-visible:outline-none focus-visible:ring-2 ' +
              'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
              'focus-visible:ring-offset-surface ' +
              'disabled:cursor-not-allowed disabled:opacity-50 ' +
              (active
                ? 'bg-accent text-accent-fg'
                : 'text-text-muted hover:text-text')
            }
          >
            {m === 'basic' ? 'Basic' : 'Advanced'}
          </button>
        );
      })}
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
  // Whether the Advanced surface is active. Shared between the mobile pill
  // tabs and the desktop drawer so the state survives a viewport crossing
  // 900px (tablet rotation, browser split, etc.). `mode` is derived from
  // it, not a separate state.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const mode: 'basic' | 'advanced' = advancedOpen ? 'advanced' : 'basic';

  const firstName = user?.firstName ?? null;

  async function handleStart(e: SubmitEvent<HTMLFormElement>) {
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
          ? extractApiErrorDetail(err)
          : (err as Error).message,
      );
      setSubmitting(false);
    }
  }

  const targetRoleBadge = me?.target_role ? (
    <p className="text-[13px] text-text-subtle">
      Target role: <span className="text-text-muted">{me.target_role}</span>
    </p>
  ) : null;

  const errorBlock = setupError ? (
    <p role="alert" aria-live="polite" className="mt-10 text-sm leading-[1.6] text-text-muted">
      <span className="mr-3 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
      {setupError}
    </p>
  ) : null;

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

              {/* Desktop slab: ≥ 900px */}
              <div className="hidden min-[900px]:block">
                <h1
                  className="anim-reveal mb-10 font-display font-medium leading-[1.15] tracking-[-0.02em] text-text md:mb-12"
                  style={{ animationDelay: '80ms', fontSize: 'clamp(2.25rem, 5vw, 4.25rem)' }}
                >
                  Which company are you
                  <br />
                  interviewing with?
                </h1>

                <label className="anim-reveal block max-w-[clamp(20rem,55vw,42rem)]" style={{ animationDelay: '160ms' }}>
                  <span className="sr-only">Company name</span>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Stripe, Figma, OpenAI..."
                    autoComplete="off"
                    autoFocus
                    disabled={submitting}
                    className={companyInputClass}
                  />
                </label>

                <div
                  className="anim-reveal mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 max-w-[42rem]"
                  style={{ animationDelay: '200ms' }}
                >
                  <AutoSubmitPill
                    autoSubmit={autoSubmit}
                    onToggle={() => setAutoSubmit((v) => !v)}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    disabled={submitting}
                    aria-expanded={advancedOpen}
                    aria-haspopup="dialog"
                    className="inline-flex items-center gap-1 text-[13px] text-text-muted cursor-pointer underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>Advanced</span>
                    <ChevronRight
                      aria-hidden
                      className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

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
                  {targetRoleBadge}
                </div>

                {errorBlock}
              </div>

              {/* Mobile slab: < 900px */}
              <div className="block min-[900px]:hidden">
                <section key={mode} className="anim-crossfade">
                  {mode === 'basic' ? (
                    <>
                      <h1
                        className="mb-10 font-display font-medium leading-[1.15] tracking-[-0.02em] text-text md:mb-12"
                        style={{ fontSize: 'clamp(2.25rem, 5vw, 4.25rem)' }}
                      >
                        Which company are you
                        <br />
                        interviewing with?
                      </h1>

                      <label className="block max-w-[clamp(20rem,55vw,42rem)]">
                        <span className="sr-only">Company name</span>
                        <input
                          type="text"
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          placeholder="Stripe, Figma, OpenAI..."
                          autoComplete="off"
                          disabled={submitting}
                          className={companyInputClass}
                        />
                      </label>

                      <div className="mt-8">
                        <AutoSubmitPill
                          autoSubmit={autoSubmit}
                          onToggle={() => setAutoSubmit((v) => !v)}
                          disabled={submitting}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <h2
                        className="mb-8 font-display font-medium leading-[1.15] tracking-[-0.02em] text-text"
                        style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}
                      >
                        Customize your interview
                      </h2>
                      <AdvancedPanel
                        voiceId={voiceId}
                        onVoiceSelect={setVoiceId}
                        disabled={submitting}
                      />
                    </>
                  )}
                </section>

                <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <FlowHoverButton
                    type="submit"
                    disabled={!company.trim() || submitting}
                  >
                    {submitting ? 'Starting...' : 'Begin session'}
                  </FlowHoverButton>
                  <ModeTabs
                    mode={mode}
                    setMode={(m) => setAdvancedOpen(m === 'advanced')}
                    disabled={submitting}
                  />
                  {targetRoleBadge}
                </div>

                {errorBlock}
              </div>
            </div>
          </form>

          <AdvancedPanelDrawer
            open={advancedOpen}
            onClose={() => setAdvancedOpen(false)}
            voiceId={voiceId}
            onVoiceSelect={setVoiceId}
            disabled={submitting}
          />
        </div>
      </main>

      <ScoreDimensions tagline="One opening question. One follow-up. Then the scores." />
    </div>
  );
}
