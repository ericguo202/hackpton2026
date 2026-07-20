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
 * TopBar.tsx uses for nav vs hamburger). Both keep the same core: one company
 * question + Begin session, with Advanced / Privacy as optional refinements off
 * the shared `surface` state. Desktop exposes those as right-side drawers
 * (`AdvancedPanelDrawer` / `PrivacyPanelDrawer`) opened by quiet inline
 * "Advanced ›" / "Privacy ›" triggers; the form on the left stays usable.
 * Mobile opens the same `AdvancedPanel` / `PrivacyPanel` content in a
 * bottom sheet (`MobileSheet`) and pins Begin session to a thumb-anchored
 * bar so it's always reachable without scrolling past the refinements.
 */

import { useState, type SubmitEvent } from 'react';
import { useUser } from '@clerk/react';
import { ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';

import AccountButton from '../components/AccountButton';
import AdvancedPanel, { SPEECH_PACE_DEFAULT } from '../components/AdvancedPanel';
import type { SpeechPace } from '../components/AdvancedPanel';
import AdvancedPanelDrawer from '../components/AdvancedPanelDrawer';
import SessionLengthField, {
  MIN_SESSION_TURNS,
} from '../components/SessionLengthField';
import DeliveryConsentDialog from '../components/DeliveryConsentDialog';
import FlashBanner from '../components/FlashBanner';
import HomeTutorial from '../components/home-tutorial/HomeTutorial';
import MobileSheet from '../components/MobileSheet';
import { MismatchConfirmDialog } from '../components/MismatchConfirmDialog';
import PrivacyPanel from '../components/PrivacyPanel';
import PrivacyPanelDrawer from '../components/PrivacyPanelDrawer';
import QuestionTypeField from '../components/QuestionTypeField';
import { RECOMMENDED_MIX } from '../types/session';
import RoleSwitcher from '../components/RoleSwitcher';
import SiteFooter from '../components/SiteFooter';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { Button } from '../components/ui/button';
import { useApi } from '../hooks/useApi';
import { useCustomQuestions } from '../hooks/useCustomQuestions';
import { useDeliveryConsent } from '../hooks/useDeliveryConsent';
import { useLocalStoragePref } from '../hooks/useLocalStoragePref';
import { useMe } from '../hooks/useMe';
import { useSessions } from '../hooks/useSessions';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { violatesContentPolicy } from '../lib/contentPolicy';
import { dismissHomeTutorial, isHomeTutorialDismissed } from '../lib/homeTutorial';
import type { PracticeLocationState } from './Practice';

/**
 * Pull the `{message}` out of the 409 job-description-mismatch body. The
 * backend sends `detail: { code, message }` (a non-string detail), so
 * `extractApiErrorDetail` returns the raw JSON — parse the message ourselves.
 */
function mismatchMessageFrom(err: ApiError): string {
  try {
    const detail = JSON.parse(err.body)?.detail;
    if (detail && typeof detail.message === 'string') return detail.message;
  } catch {
    /* fall through */
  }
  return "Your target role, industry, or company doesn't seem to match this job description.";
}

type Surface = 'basic' | 'advanced' | 'privacy';

type SessionStart = {
  session_id: string;
  summary: { description: string; headlines: string[]; values: string[] };
  first_question: string;
  first_question_audio_url: string;
  first_question_category: string;
  num_turns: number;
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

function ShowQuestionTextPill({
  showQuestionText,
  onToggle,
  disabled,
}: {
  showQuestionText: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={showQuestionText}
      title="Show the question on screen during your turn. You can also toggle this mid-session."
      className={
        showQuestionText
          ? 'rounded-full border border-accent bg-accent px-3 py-1 text-xs font-medium text-accent-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50'
          : 'cursor-pointer rounded-full border border-border bg-transparent px-3 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      Question text: {showQuestionText ? 'On' : 'Off'}
    </button>
  );
}

/**
 * A quiet "Advanced ›" / "Privacy ›" refinement trigger. Shared by the desktop
 * inline row and the mobile core body; both just flip the `surface` state
 * (desktop opens a drawer, mobile a bottom sheet).
 */
function RefineTrigger({
  label,
  active,
  disabled,
  onClick,
  tourId,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  tourId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={active}
      aria-haspopup="dialog"
      data-tour={tourId}
      className="inline-flex items-center gap-1 text-sm text-text-muted cursor-pointer underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>{label}</span>
      <ChevronRight
        aria-hidden
        className={`h-3.5 w-3.5 transition-transform ${active ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

export default function Home() {
  const { user } = useUser();
  const { me, refetch } = useMe();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  // First-run tutorial: shown once a brand-new user (no sessions yet) lands on
  // Home, unless they've finished it or chosen "Do not show again". `closed`
  // tracks an in-session Skip/Esc (no persistence) so it re-offers next visit.
  const { sessions, isReady: sessionsReady } = useSessions();
  const tutorialUserId = me?.clerk_user_id ?? null;
  const [tutorialClosed, setTutorialClosed] = useState(false);
  const showTutorial =
    sessionsReady &&
    sessions !== null &&
    sessions.length === 0 &&
    tutorialUserId !== null &&
    !isHomeTutorialDismissed(tutorialUserId) &&
    !tutorialClosed;

  const [company, setCompany] = useState('');
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [numTurns, setNumTurns] = useState(MIN_SESSION_TURNS);
  // Question FORM for the whole session (single-category). Only built types are
  // offered (see SELECTABLE_QUESTION_CATEGORIES); the backend rejects the rest.
  const [questionCategory, setQuestionCategory] = useState(RECOMMENDED_MIX);
  // Interview-voice pace (→ backend `speech_pace`, resolved per-voice server
  // side). Defaults to "Normal".
  const [speechPace, setSpeechPace] = useState<SpeechPace>(SPEECH_PACE_DEFAULT);
  const [jobDescription, setJobDescription] = useState('');
  // The caller's custom questions + which one (if any) is selected for this
  // session. When selected, the backend skips the opening-question LLM call and
  // uses the chosen question verbatim (research still runs).
  const { questions: customQuestions } = useCustomQuestions();
  const [selectedCustomQuestionId, setSelectedCustomQuestionId] = useState<
    string | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  // Open when the backend flags a JD ↔ profile mismatch (409). Confirming
  // re-submits with `acknowledge_mismatch: true`.
  const [mismatch, setMismatch] = useState<string | null>(null);
  // Persisted across sessions; Practice.tsx reads the same key for its
  // auto-submit effect.
  const [autoSubmit, setAutoSubmit] = useLocalStoragePref('auto_submit_enabled', false);
  // Same key the mid-session eye-icon toggle in Practice.tsx writes to —
  // both surfaces share state via localStorage. Default true (visible).
  const [showQuestionText, setShowQuestionText] = useLocalStoragePref('show_question_text', true);
  // Which setup surface is active. Shared across breakpoints so it survives a
  // viewport crossing 900px. 'basic' = closed; 'advanced'/'privacy' open the
  // matching desktop drawer (≥900px) or mobile bottom sheet (<900px).
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
    acknowledgeMismatch = false,
  ) {
    const trimmed = company.trim();
    if (!trimmed) return;

    // Instant client-side injection check on the pasted JD (mirrors the bio /
    // résumé gate); the backend re-checks authoritatively. Empty JD is fine.
    const jd = jobDescription.trim();
    if (jd && violatesContentPolicy(jd)) {
      setSetupError('The job description contains content that violates our usage policies. Please revise it.');
      return;
    }

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
          num_turns: numTurns,
          // "Recommended Mix" is a UI-only sentinel: send `calibrated_mix` so the
          // backend draws a calibrated category per opening. An explicit type
          // keeps the single-category path (sends `question_category`).
          ...(questionCategory === RECOMMENDED_MIX
            ? { calibrated_mix: true }
            : { question_category: questionCategory }),
          speech_pace: speechPace,
          ...(voiceId ? { voice_id: voiceId } : {}),
          ...(jd ? { job_description: jd } : {}),
          ...(acknowledgeMismatch ? { acknowledge_mismatch: true } : {}),
          ...(selectedCustomQuestionId
            ? { custom_question_id: selectedCustomQuestionId }
            : {}),
        }),
      });
      trackEvent('practice_session_started', {
        has_custom_voice: Boolean(voiceId),
        num_turns: data.num_turns,
        auto_submit_enabled: autoSubmit,
        delivery_analytics_enabled: deliveryAnalyticsWillBeEnabled,
        user_tier: me?.tier ?? 'unknown',
      });
      setMismatch(null);
      const state: PracticeLocationState = {
        sessionId: data.session_id,
        firstQuestion: data.first_question,
        firstQuestionAudioUrl: data.first_question_audio_url,
        firstQuestionCategory: data.first_question_category,
        numTurns: data.num_turns,
        company: trimmed,
        jobTitle: me?.target_role ?? 'Software Engineer',
      };
      navigate('/practice', { state });
    } catch (err) {
      // 409 = the pasted job description doesn't appear to match the target
      // role/industry/company. Ask the user to confirm; on confirm we re-submit
      // with acknowledge_mismatch=true (which skips the server match-check).
      if (err instanceof ApiError && err.status === 409) {
        setMismatch(mismatchMessageFrom(err));
        setSubmitting(false);
        return;
      }
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

  // Active-role badge; for multi-role users this becomes a "Change" switcher.
  const targetRoleBadge = me ? (
    <RoleSwitcher me={me} refetch={refetch} />
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

  // Compact daily-count status under the mobile pinned Begin button. The target
  // role now lives in the mobile slab as its own switcher (see below), so the
  // pinned bar only carries the free-tier daily count. Empty (hidden) otherwise.
  const mobileBarStatus =
    me?.tier === 'free' ? `${me.daily_session_count}/5 today` : '';

  const errorBlock = setupError ? (
    <p role="alert" aria-live="polite" className="mt-10 text-sm leading-[1.6] text-text-muted">
      <span className="mr-3 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
      {setupError}
    </p>
  ) : null;

  return (
    // `pb-28` on mobile keeps the footer clear of the pinned Begin bar; removed
    // at ≥900px where the bar isn't rendered.
    <div className="min-h-screen flex flex-col bg-surface text-text pb-28 min-[900px]:pb-0">
      <TopBar
        nav={
          <>
            <TopBarNavLink to="/" matchPatterns={['/practice']} tourId="nav-practice">
              Practice
            </TopBarNavLink>
            <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']} tourId="nav-history">
              History
            </TopBarNavLink>
            <TopBarNavLink to="/personalize" tourId="nav-personalize">
              Personalize
            </TopBarNavLink>
            <TopBarNavLink to="/calibrate" tourId="nav-calibration">
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
            id="setup-form"
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
                    data-tour="company-input"
                    className={companyInputClass}
                  />
                </label>

                <div
                  className="anim-reveal mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 max-w-[42rem]"
                  style={{ animationDelay: '200ms' }}
                >
                  <span data-tour="pill-toggles" className="flex items-center gap-x-4 gap-y-2">
                    <AutoSubmitPill
                      autoSubmit={autoSubmit}
                      onToggle={() => setAutoSubmit((v) => !v)}
                      disabled={submitting}
                    />
                    <ShowQuestionTextPill
                      showQuestionText={showQuestionText}
                      onToggle={() => setShowQuestionText((v) => !v)}
                      disabled={submitting}
                    />
                  </span>
                  <SessionLengthField
                    id="session-turns-desktop"
                    tourId="length-slider"
                    numTurns={numTurns}
                    onChange={setNumTurns}
                    disabled={submitting}
                  />
                  <QuestionTypeField
                    value={questionCategory}
                    onChange={setQuestionCategory}
                    disabled={submitting}
                    tourId="question-type"
                  />
                </div>

                {/* Advanced / Privacy triggers sit on their own row (like mobile)
                    so they never get pushed onto a second line by the toggles +
                    popover launchers above. */}
                <div
                  className="anim-reveal mt-6 flex flex-wrap items-center gap-x-6 gap-y-2"
                  style={{ animationDelay: '240ms' }}
                >
                  <RefineTrigger
                    label="Advanced"
                    active={surface === 'advanced'}
                    disabled={submitting}
                    tourId="advanced-trigger"
                    onClick={() =>
                      setSurface((s) => (s === 'advanced' ? 'basic' : 'advanced'))
                    }
                  />
                  <RefineTrigger
                    label="Privacy"
                    active={surface === 'privacy'}
                    disabled={submitting}
                    tourId="privacy-trigger"
                    onClick={() =>
                      setSurface((s) => (s === 'privacy' ? 'basic' : 'privacy'))
                    }
                  />
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

              {/* Mobile slab: < 900px. Core only — the company question and quick
                  toggles. Advanced/Privacy open as bottom sheets; Begin session
                  is the pinned bar below. `pb-28` keeps the last row clear of it. */}
              <div className="block min-[900px]:hidden pb-28">
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

                <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <AutoSubmitPill
                    autoSubmit={autoSubmit}
                    onToggle={() => setAutoSubmit((v) => !v)}
                    disabled={submitting}
                  />
                  <ShowQuestionTextPill
                    showQuestionText={showQuestionText}
                    onToggle={() => setShowQuestionText((v) => !v)}
                    disabled={submitting}
                  />
                  <SessionLengthField
                    id="session-turns-mobile"
                    numTurns={numTurns}
                    onChange={setNumTurns}
                    disabled={submitting}
                  />
                  <QuestionTypeField
                    value={questionCategory}
                    onChange={setQuestionCategory}
                    disabled={submitting}
                  />
                </div>

                {/* Target role + switcher. On mobile it lives in the slab body
                    (not the pinned bar) so its popover opens downward into the
                    content instead of off the bottom edge. */}
                {targetRoleBadge && <div className="mt-6">{targetRoleBadge}</div>}

                <div className="mt-6 flex items-center gap-x-6">
                  <RefineTrigger
                    label="Advanced"
                    active={surface === 'advanced'}
                    disabled={submitting}
                    onClick={() => setSurface('advanced')}
                  />
                  <RefineTrigger
                    label="Privacy"
                    active={surface === 'privacy'}
                    disabled={submitting}
                    onClick={() => setSurface('privacy')}
                  />
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
            speechPace={speechPace}
            onSpeechPaceChange={setSpeechPace}
            jobDescription={jobDescription}
            onJobDescriptionChange={setJobDescription}
            customQuestions={customQuestions ?? []}
            selectedCustomQuestionId={selectedCustomQuestionId}
            onSelectCustomQuestion={setSelectedCustomQuestionId}
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
            showAnalytics={false}
          />

          {/* Mobile (< 900px): the same Advanced / Privacy content as the desktop
              drawers, opened as bottom sheets off the shared `surface` state. */}
          <MobileSheet
            open={surface === 'advanced'}
            title="Advanced"
            onClose={() => setSurface('basic')}
          >
            <AdvancedPanel
              voiceId={voiceId}
              onVoiceSelect={setVoiceId}
              speechPace={speechPace}
              onSpeechPaceChange={setSpeechPace}
              jobDescription={jobDescription}
              onJobDescriptionChange={setJobDescription}
              customQuestions={customQuestions ?? []}
              selectedCustomQuestionId={selectedCustomQuestionId}
              onSelectCustomQuestion={setSelectedCustomQuestionId}
              disabled={submitting}
            />
          </MobileSheet>

          <MobileSheet
            open={surface === 'privacy'}
            title="Privacy"
            onClose={() => setSurface('basic')}
          >
            <PrivacyPanel
              active={deliveryConsentActive}
              busy={consentBusy}
              error={consentError}
              consentLabel={deliveryConsentLabel}
              onGrant={() => { void grantConsent(); }}
              onRevoke={() => { void revokeConsent(); }}
              showAnalytics={false}
            />
          </MobileSheet>
        </div>
      </main>

      {/* Mobile (< 900px): pinned thumb bar so Begin session is always reachable
          without scrolling past the refinements. Portaled to <body> (the hero is
          `overflow-hidden` under transformed ancestors) and submits the setup
          form via the `form` attribute despite living outside its subtree. Sits
          below the sheet overlay (z-40 < z-50) so it's covered while a sheet is
          open. */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-0 z-40 min-[900px]:hidden border-t border-border bg-surface/95 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <Button
            type="submit"
            form="setup-form"
            disabled={!company.trim() || submitting}
            className="w-full"
          >
            {submitting ? 'Starting...' : 'Begin session'}
          </Button>
          {mobileBarStatus && (
            <p className="mt-2 text-center text-xs text-text-subtle">
              {mobileBarStatus}
            </p>
          )}
        </div>,
        document.body,
      )}

      <SiteFooter signedIn />

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

      <MismatchConfirmDialog
        open={mismatch !== null}
        message={mismatch ?? ''}
        busy={submitting}
        onCancel={() => setMismatch(null)}
        onConfirm={() => { void createAndGoToSession(deliveryConsentActive, true); }}
      />

      {showTutorial && (
        <HomeTutorial
          onSkip={() => setTutorialClosed(true)}
          onComplete={() => {
            if (tutorialUserId) dismissHomeTutorial(tutorialUserId);
            setTutorialClosed(true);
          }}
          onDismiss={() => {
            if (tutorialUserId) dismissHomeTutorial(tutorialUserId);
            setTutorialClosed(true);
          }}
        />
      )}
    </div>
  );
}
