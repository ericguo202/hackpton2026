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
import { useUser } from '@clerk/react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';

import AccountButton from '../components/AccountButton';
import AdvancedPanel from '../components/AdvancedPanel';
import AdvancedPanelDrawer from '../components/AdvancedPanelDrawer';
import DeliveryConsentDialog from '../components/DeliveryConsentDialog';
import FlashBanner from '../components/FlashBanner';
import PrivacyPanel from '../components/PrivacyPanel';
import PrivacyPanelDrawer from '../components/PrivacyPanelDrawer';
import ScoreDimensions from '../components/ScoreDimensions';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { Button } from '../components/ui/button';
import { useApi } from '../hooks/useApi';
import { useDeliveryConsent } from '../hooks/useDeliveryConsent';
import { useLocalStoragePref } from '../hooks/useLocalStoragePref';
import { useMe } from '../hooks/useMe';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import type { PracticeLocationState } from './Practice';

type Surface = 'basic' | 'advanced' | 'privacy';

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
          ? 'rounded-full border border-accent bg-accent px-3 py-1 text-xs font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
          : 'cursor-pointer rounded-full border border-border bg-transparent px-3 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      Auto-submit: {autoSubmit ? 'On' : 'Off'}
    </button>
  );
}

const SURFACE_LABELS: Record<Surface, string> = {
  basic: 'Basic',
  advanced: 'Advanced',
  privacy: 'Privacy',
};

function ModeTabs({
  mode,
  setMode,
  disabled,
}: {
  mode: Surface;
  setMode: (m: Surface) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Setup mode"
      className="inline-flex rounded border border-border bg-surface-raised p-0.5"
    >
      {(['basic', 'advanced', 'privacy'] as const).map((m) => {
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
            {SURFACE_LABELS[m]}
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
  // Same key the mid-session eye-icon toggle in Practice.tsx writes to —
  // both surfaces share state via localStorage. Default true (visible).
  const [showQuestionText, setShowQuestionText] = useLocalStoragePref('show_question_text', true);
  // Which setup surface is active. Shared between the mobile pill tabs and the
  // desktop drawers so it survives a viewport crossing 900px. 'basic' = no
  // drawer open on desktop; 'advanced'/'privacy' open the matching drawer.
  const [surface, setSurface] = useState<Surface>('basic');

  // Pre-session delivery-analytics consent popup open/closed (Home-only UI).
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  // Shared grant/revoke flow (same hook drives the /settings Privacy tab).
  // Renamed on destructure so the references throughout this file stay put.
  const {
    active: deliveryConsentActive,
    label: deliveryConsentLabel,
    busy: consentBusy,
    error: consentError,
    setError: setConsentError,
    grant: grantConsent,
    revoke: revokeConsent,
  } = useDeliveryConsent();

  const firstName = user?.firstName ?? null;

  // Mic preflight + POST /sessions + navigate to /practice. Camera enabling is
  // decided in Practice from the persisted consent on `me`, so this doesn't
  // need to know the consent choice — it just creates the session.
  async function createAndGoToSession(
    deliveryAnalyticsWillBeEnabled = deliveryConsentActive,
  ) {
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
          // Browser-local IANA timezone — backend uses this to compute the
          // user's "today" for the free-tier daily-limit reset. Untrusted
          // on the server side (UTC fallback on parse failure).
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(voiceId ? { voice_id: voiceId } : {}),
        }),
      });
      trackEvent('practice_session_started', {
        has_custom_voice: Boolean(voiceId),
        auto_submit_enabled: autoSubmit,
        delivery_analytics_enabled: deliveryAnalyticsWillBeEnabled,
        user_tier: me?.tier ?? 'unknown',
      });
      const state: PracticeLocationState = {
        sessionId: data.session_id,
        firstQuestion: data.first_question,
        firstQuestionAudioUrl: data.first_question_audio_url,
        company: trimmed,
        jobTitle: me?.target_role ?? 'Software Engineer',
      };
      navigate('/practice', { state });
    } catch (err) {
      // 429 = free-tier daily-limit hit. Surface as a FlashBanner notice
      // (overlay near the top) rather than the inline error block, since
      // it's not a transient form error — the user can't retry by
      // tweaking the input, only by waiting until tomorrow or upgrading.
      if (err instanceof ApiError && err.status === 429) {
        navigate('/', {
          replace: true,
          state: { flash: extractApiErrorDetail(err) },
        });
        setSubmitting(false);
        return;
      }
      setSetupError(
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : (err as Error).message,
      );
      setSubmitting(false);
    }
  }

  function handleStart(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!company.trim()) return;
    // First-time gate: ask for delivery-analytics consent before creating the
    // session. Once consent is active we never re-prompt — start immediately.
    if (!deliveryConsentActive) {
      setConsentError(null);
      setConsentModalOpen(true);
      return;
    }
    void createAndGoToSession();
  }

  // Popup actions: consent → save then start (camera enabled in Practice);
  // decline → start voice-only (consent stays inactive → camera never enabled).
  async function handleConsentAndStart() {
    const ok = await grantConsent();
    if (!ok) return;
    setConsentModalOpen(false);
    void createAndGoToSession(true);
  }

  function handleDeclineAndStart() {
    setConsentModalOpen(false);
    void createAndGoToSession(false);
  }

  const targetRoleBadge = me?.target_role ? (
    <p className="text-sm text-text-subtle">
      Target role: <span className="text-text-muted">{me.target_role}</span>
    </p>
  ) : null;

  // Free-tier usage indicator. Pro users see nothing — the counter is
  // meaningless to them. Rendered as data, not celebration: no progress
  // bar, no streak, no color. Refreshes automatically when the user
  // returns to Home after completing a session (useMe refetches on mount).
  const dailyLimitBadge = me?.tier === 'free' ? (
    <p className="text-sm text-text-subtle">
      <span className="text-text-muted">{me.daily_session_count}/5</span> sessions today
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
            <TopBarNavLink to="/calibrate">
              Calibration
            </TopBarNavLink>
          </>
        }
        rightSlot={<AccountButton />}
      />

      <FlashBanner />

      <main className="flex-1">
        <div className="relative flex min-h-full items-center overflow-hidden">
          {/* Decorative brand accent. Deliberately >=1250px only so it never
              competes with the company input on smaller layouts. */}
          <img
            aria-hidden="true"
            alt=""
            src="/interviewpie_cherry_pie_slice.svg"
            className="anim-reveal pointer-events-none hidden min-[1250px]:block absolute right-[5vw] top-1/2 h-[28rem] w-[40rem] -translate-y-1/2 object-contain"
            style={{ animationDelay: '320ms' }}
          />

          <form
            onSubmit={handleStart}
            className="relative z-10 mx-auto w-full max-w-[80rem] 2xl:max-w-[88rem] px-8 py-16 md:px-16 md:py-24"
          >
            <div className="max-w-[54rem]">
              <p
                className="anim-reveal mb-10 text-sm font-medium text-text-muted md:mb-12"
                style={{ animationDelay: '0ms' }}
              >
                Good {timeOfDay()}{firstName ? `, ${firstName}` : ''}
              </p>

              {/* Desktop slab: ≥ 900px */}
              <div className="hidden min-[900px]:block">
                <h1
                  className="anim-reveal mb-10 font-display font-semibold leading-[1.15] tracking-[-0.02em] text-text md:mb-12"
                  style={{ animationDelay: '80ms', fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
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
                    maxLength={60}
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
                    onClick={() =>
                      setSurface((s) => (s === 'advanced' ? 'basic' : 'advanced'))
                    }
                    disabled={submitting}
                    aria-expanded={surface === 'advanced'}
                    aria-haspopup="dialog"
                    className="inline-flex items-center gap-1 text-sm text-text-muted cursor-pointer underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>Advanced</span>
                    <ChevronRight
                      aria-hidden
                      className={`h-3.5 w-3.5 transition-transform ${surface === 'advanced' ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSurface((s) => (s === 'privacy' ? 'basic' : 'privacy'))
                    }
                    disabled={submitting}
                    aria-expanded={surface === 'privacy'}
                    aria-haspopup="dialog"
                    className="inline-flex items-center gap-1 text-sm text-text-muted cursor-pointer underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>Privacy</span>
                    <ChevronRight
                      aria-hidden
                      className={`h-3.5 w-3.5 transition-transform ${surface === 'privacy' ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                <div
                  className="anim-reveal mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-4"
                  style={{ animationDelay: '280ms' }}
                >
                  <Button
                    type="submit"
                    disabled={!company.trim() || submitting}
                  >
                    {submitting ? 'Starting...' : 'Begin session'}
                  </Button>
                  {targetRoleBadge}
                  {dailyLimitBadge}
                </div>

                {errorBlock}
              </div>

              {/* Mobile slab: < 900px */}
              <div className="block min-[900px]:hidden">
                <section key={surface} className="anim-crossfade">
                  {surface === 'basic' ? (
                    <>
                      <h1
                        className="mb-10 font-display font-semibold leading-[1.15] tracking-[-0.02em] text-text md:mb-12"
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
                          maxLength={60}
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
                  ) : surface === 'advanced' ? (
                    <>
                      <h2
                        className="mb-8 font-display font-semibold leading-[1.15] tracking-[-0.02em] text-text"
                        style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}
                      >
                        Customize your interview
                      </h2>
                      <AdvancedPanel
                        voiceId={voiceId}
                        onVoiceSelect={setVoiceId}
                        showQuestionText={showQuestionText}
                        onToggleShowQuestionText={() => setShowQuestionText((v) => !v)}
                        disabled={submitting}
                      />
                    </>
                  ) : (
                    <>
                      <h2
                        className="mb-8 font-display font-semibold leading-[1.15] tracking-[-0.02em] text-text"
                        style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}
                      >
                        Privacy
                      </h2>
                      <PrivacyPanel
                        active={deliveryConsentActive}
                        busy={consentBusy}
                        error={consentError}
                        consentLabel={deliveryConsentLabel}
                        onGrant={() => { void grantConsent(); }}
                        onRevoke={() => { void revokeConsent(); }}
                      />
                    </>
                  )}
                </section>

                <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <Button
                    type="submit"
                    disabled={!company.trim() || submitting}
                  >
                    {submitting ? 'Starting...' : 'Begin session'}
                  </Button>
                  <ModeTabs
                    mode={surface}
                    setMode={setSurface}
                    disabled={submitting}
                  />
                  {targetRoleBadge}
                  {dailyLimitBadge}
                </div>

                {errorBlock}
              </div>
            </div>
          </form>

          <AdvancedPanelDrawer
            open={surface === 'advanced'}
            onClose={() => setSurface('basic')}
            voiceId={voiceId}
            onVoiceSelect={setVoiceId}
            showQuestionText={showQuestionText}
            onToggleShowQuestionText={() => setShowQuestionText((v) => !v)}
            disabled={submitting}
          />

          <PrivacyPanelDrawer
            open={surface === 'privacy'}
            onClose={() => setSurface('basic')}
            active={deliveryConsentActive}
            busy={consentBusy}
            error={consentError}
            consentLabel={deliveryConsentLabel}
            onGrant={() => { void grantConsent(); }}
            onRevoke={() => { void revokeConsent(); }}
          />
        </div>
      </main>

      <ScoreDimensions legal />

      <DeliveryConsentDialog
        open={consentModalOpen}
        busy={consentBusy}
        error={consentError}
        onConsent={() => { void handleConsentAndStart(); }}
        onDecline={handleDeclineAndStart}
        onCancel={() => {
          if (!consentBusy) setConsentModalOpen(false);
        }}
      />
    </div>
  );
}
