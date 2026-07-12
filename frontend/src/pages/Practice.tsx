/**
 * Practice — runs an active interview session (recording only).
 *
 * Question audio plays → recorder auto-starts on `ended` → user stops →
 * submit → repeat until the configured final turn. When the final turn is submitted, redirects
 * to `/sessions/:id?from=practice`, where the results/feedback now live
 * (SessionDetail renders the same folder-tab shell and polls for the async
 * scores). This page is deliberately chrome-free / full-viewport.
 *
 * Mounted at `/practice`. Reads the initial `sessionId` and first question
 * (text + audio URL) from `useLocation().state`, populated by `Home`'s
 * start-session handler. If state is missing (refresh, direct URL,
 * browser-back into a stale `/practice`), redirects to `/`.
 *
 * Recorded answer video/audio is never persisted server-side — it only
 * exists as in-browser `blob:` URLs. Each submitted turn's replay URLs are
 * handed to the module-level `practiceReplayStore` so they survive the
 * client-side redirect into SessionDetail's per-turn replay cards.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { PracticeFooter } from '../components/PracticeFooter';
import { QuitConfirmDialog } from '../components/QuitConfirmDialog';
import { CameraColumn, type RecordingNotice } from '../components/practice/CameraColumn';
import { QuestionColumn } from '../components/practice/QuestionColumn';
import { TranscriptColumn } from '../components/practice/TranscriptColumn';
import { Button } from '../components/ui/button';
import { useApi } from '../hooks/useApi';
import { useFaceAnalyzer, type AnalyzerDiagnostics } from '../hooks/useFaceAnalyzer';
import { useLocalStoragePref } from '../hooks/useLocalStoragePref';
import { useMe } from '../hooks/useMe';
import { useRecorder } from '../hooks/useRecorder';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { hasActiveDeliveryAnalyticsConsent } from '../lib/deliveryAnalyticsConsent';
import { readFaceCalibration } from '../lib/faceCalibration';
import { hasActiveFaceCalibrationConsent } from '../lib/faceCalibrationConsent';
import { appendPracticeReplay, clearPracticeReplays } from '../lib/practiceReplayStore';
import { cn } from '../lib/utils';
import type { TurnResult } from '../types/session';

export type PracticeLocationState = {
  sessionId: string;
  firstQuestion: string;
  firstQuestionAudioUrl: string;
  /** Total questions in this session. Older entry points omit it and default
   *  to the original two-turn flow. */
  numTurns?: number;
  /** Echoed from the Setup form so the results screen can identify the
   *  session without waiting for the SessionDetail refetch. */
  company: string;
  jobTitle: string;
};

type CurrentQ = { text: string; audioUrl: string; num: number; isFollowup: boolean };

/** Minimal record of a completed turn — just what the in-session transcript
 *  toggle needs to show the prior answer during the next turn. */
type PriorTurn = { question: string; transcript: string };

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

// Recording-length guardrails (seconds of actual recording, not question
// playback). Keeps a normal answer well under the backend's 50 MB audio cap
// and nudges the candidate to stay concise. warn → countdown → auto-stop.
const RECORDING_WARNING_SECONDS = 240;   // 4:00 — gentle heads-up appears
const RECORDING_COUNTDOWN_SECONDS = 270; // 4:30 — live countdown begins
const RECORDING_MAX_SECONDS = 300;       // 5:00 — recording auto-stops

function formatTurnSubmitError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }

  const detail = extractApiErrorDetail(err);
  if (isUsagePolicyViolation(err)) {
    return 'This violates the usage policy. Please re-record and try again.';
  }
  return detail;
}

// A usage-policy 422 (moderation or prompt-injection gate) is NOT transient:
// re-submitting the same audio yields the same transcript and fails again. The
// only fix is to record a fresh answer, so the error UI offers "Restart turn"
// instead of "Retry submission" for this case.
function isUsagePolicyViolation(err: unknown): boolean {
  return (
    err instanceof ApiError
    && err.status === 422
    && extractApiErrorDetail(err).toLowerCase().includes('violates our usage policy')
  );
}

function SessionInfoPanel({
  turnNum,
  recorderState,
  diagnostics,
}: {
  turnNum: number;
  recorderState: 'idle' | 'recording' | 'stopped';
  diagnostics: AnalyzerDiagnostics;
}) {
  const summary = diagnostics.lastSummary;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border-strong bg-surface-raised/95 p-4 shadow-xl backdrop-blur">
      <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Session info
      </p>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs text-text-muted">
        <dt>Turn</dt>
        <dd className="text-text">{turnNum}</dd>
        <dt>Recorder</dt>
        <dd className="text-text">{recorderState}</dd>
        <dt>Analyzer</dt>
        <dd className="text-text">{diagnostics.status}</dd>
        <dt>Frames</dt>
        <dd className="text-text">{diagnostics.framesProcessed}</dd>
        <dt>Face frames</dt>
        <dd className="text-text">{diagnostics.faceFrames}</dd>
        {summary && (
          <>
            <dt>Eye contact</dt>
            <dd className="text-text">{summary.eye_contact_score}/100</dd>
            <dt>Looked away</dt>
            <dd className="text-text">{summary.looked_away_pct}%</dd>
            <dt>Expression</dt>
            <dd className="text-text">{summary.expression_score}/100</dd>
            <dt>Posture</dt>
            <dd className="text-text">{summary.posture_score}/100</dd>
            <dt>Head tilt</dt>
            <dd className="text-text">{summary.head_tilt_degrees_avg} deg avg</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default function Practice() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as PracticeLocationState | null;

  // Refresh / direct URL / browser-back into a stale /practice has no
  // session state to resume. Silently send the user back to Setup.
  if (!state || !state.sessionId || !state.firstQuestion) {
    return <Navigate to="/" replace />;
  }

  return <PracticeSession initial={state} navigate={navigate} />;
}

function PracticeSession({
  initial,
  navigate,
}: {
  initial: PracticeLocationState;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { apiFetch } = useApi();
  const { me } = useMe();
  const recorder = useRecorder();
  // Only apply the on-device calibration baseline when face-calibration consent
  // is active for THIS user (current notice version, not revoked). A stale or
  // missing consent → null, so the analyzer falls back to the uncalibrated
  // defaults and never applies another account's baseline on a shared browser.
  const calibration = useMemo(
    () =>
      me?.clerk_user_id && hasActiveFaceCalibrationConsent(me)
        ? readFaceCalibration(me.clerk_user_id)
        : null,
    [me],
  );
  const analyzer = useFaceAnalyzer(
    recorder.videoStream,
    recorder.state === 'recording',
    calibration,
  );

  const [showQuestionText, setShowQuestionText] = useLocalStoragePref('show_question_text', true);
  const [showSessionInfo, setShowSessionInfo] = useState(false);
  // Off by default. When on, tapping "End answer" while recording fires the
  // auto-submit effect below and skips the preview/Re-record block entirely.
  const [autoSubmit] = useLocalStoragePref('auto_submit_enabled', false);

  const [sessionId] = useState<string>(initial.sessionId);
  const [totalTurns] = useState<number>(initial.numTurns ?? 2);
  const [currentQ, setCurrentQ] = useState<CurrentQ | null>({
    text: initial.firstQuestion,
    audioUrl: initial.firstQuestionAudioUrl,
    num: 1,
    // Turn 1 opens a story block — never a follow-up.
    isFollowup: false,
  });
  const [turnResults, setTurnResults] = useState<PriorTurn[]>([]);
  const [submittingTurn, setSubmittingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  // True when `turnError` is a non-retryable usage-policy 422 — drives the error
  // CTA to "Restart turn" (record fresh) rather than "Retry submission".
  const [turnErrorIsPolicy, setTurnErrorIsPolicy] = useState(false);
  const [retryingTurn, setRetryingTurn] = useState(false);
  const [endingTurn, setEndingTurn] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  // Set while the graded early-end request (POST /sessions/{id}/end) is in
  // flight, so the Quit dialog disables its buttons + shows "Saving…".
  const [endingSession, setEndingSession] = useState(false);
  const [endSessionError, setEndSessionError] = useState<string | null>(null);
  // Seconds of the current recording. Driven by the interval effect below;
  // reset to 0 in `handleAudioEnded` (the sole recording-start path) so it
  // never carries a stale value into a new turn.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Shared with QuestionColumn's <audio>. Practice uses it to synchronously
  // pause + detach the question audio in `handleAudioEnded`, before the
  // recorder's getUserMedia flips the iOS audio session — otherwise WebKit
  // replays the loaded buffer over the first seconds of the recording.
  const questionAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'p' || isTextInputTarget(event.target)) return;
      event.preventDefault();
      setShowSessionInfo((visible) => !visible);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-submit on Stop: as soon as MediaRecorder finishes flushing its
  // final chunk and populates `recorder.audioBlob`, fire the turn
  // submission. `submitTurnRef` holds the latest `handleSubmitTurn`
  // closure, refreshed every render in the no-deps effect below.
  const submitTurnRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    submitTurnRef.current = () => {
      void handleSubmitTurn();
    };
  });
  useEffect(() => {
    if (
      endingTurn
      && recorder.state === 'stopped'
      && recorder.audioBlob != null
      && !submittingTurn
    ) {
      submitTurnRef.current();
    }
  }, [endingTurn, recorder.state, recorder.audioBlob, submittingTurn]);

  // One auto-retry per audio blob. Resets on any new recorder blob.
  const autoRetriedRef = useRef(false);
  useEffect(() => {
    autoRetriedRef.current = false;
  }, [recorder.audioBlob]);

  // Recording-length cap. While recording, tick a local elapsed clock (drives
  // the under-camera warning/countdown) and auto-end the turn at
  // RECORDING_MAX_SECONDS via the SAME path as tapping "End recording" — so
  // auto-submit vs. manual-preview behavior is preserved at the cap.
  // `handleEndRef` mirrors the latest `handleEnd` closure (it's declared later)
  // so the interval always calls the current one without re-subscribing.
  const recordingStartRef = useRef<number | null>(null);
  const handleEndRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    handleEndRef.current = handleEnd;
  });
  useEffect(() => {
    if (recorder.state !== 'recording') {
      // Ref-only writes here (no setState) keep this lint-clean; `elapsedSeconds`
      // is reset on the next recording start in `handleAudioEnded`, and the
      // notice below is gated on `recorder.state` so a stale value never shows.
      recordingStartRef.current = null;
      return;
    }
    recordingStartRef.current = Date.now();
    let autoStopped = false;
    const id = window.setInterval(() => {
      if (recordingStartRef.current == null) return;
      const secs = Math.floor((Date.now() - recordingStartRef.current) / 1000);
      setElapsedSeconds(secs);
      if (secs >= RECORDING_MAX_SECONDS && !autoStopped) {
        autoStopped = true;
        handleEndRef.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [recorder.state]);

  // Webcam delivery scoring runs only when the user has active server-side
  // consent (granted via the pre-session popup or the Home Privacy surface).
  // Without it, `recorder.start({ video: false })` means the camera is never
  // enabled and no cv_summary is computed or sent.
  const deliveryAnalyticsEnabled = hasActiveDeliveryAnalyticsConsent(me);
  // Non-null only when the user opted into delivery analytics (a webcam
  // recording was expected) but the camera fell back to audio-only. 'failed' is
  // a technical miss (busy/hardware/iOS no-gesture) → we nudge a Restart;
  // 'denied' is a deliberate permission block → a legitimate "no webcam" choice,
  // so we state the fact without pushing a retry. Either way it's purely
  // informational and never blocks completing the session. (Declining delivery
  // analytics keeps this null — that path never sees a notice.)
  const cameraError = deliveryAnalyticsEnabled ? recorder.cameraError : null;

  async function handleSubmitTurn() {
    if (!recorder.audioBlob || !sessionId || !currentQ) return;
    const submittingTurnNumber = currentQ.num;
    trackEvent('turn_submitted', {
      turn_number: submittingTurnNumber,
      final_turn: submittingTurnNumber >= totalTurns,
      total_turns: totalTurns,
      auto_submit_enabled: autoSubmit,
      delivery_analytics_enabled: deliveryAnalyticsEnabled,
    });
    setSubmittingTurn(true);
    setEndingTurn(false);
    setTurnError(null);
    setTurnErrorIsPolicy(false);
    try {
      const form = new FormData();
      form.append('audio', recorder.audioBlob, 'answer.webm');

      const cvSummary = deliveryAnalyticsEnabled ? analyzer.buildSummary() : null;
      if (cvSummary) {
        form.append('cv_summary', JSON.stringify(cvSummary));
      } else if (deliveryAnalyticsEnabled) {
        console.warn('[Practice] cv_summary missing on submit', analyzer.diagnostics);
      }

      const result = await apiFetch<TurnResult>(
        `/api/v1/sessions/${sessionId}/turns`,
        { method: 'POST', body: form },
      );
      trackEvent('turn_submit_succeeded', {
        turn_number: submittingTurnNumber,
        final_turn: result.is_final,
        total_turns: totalTurns,
        evaluation_pending: Boolean(result.evaluation_pending),
      });

      // Stash the recorded answer's replay URLs so SessionDetail's per-turn
      // replay cards can show them after the redirect. Fresh object URLs (not
      // the recorder's own) so `recorder.reset()` between turns can't revoke
      // them out from under us.
      const replayUrl = recorder.replayBlob ? URL.createObjectURL(recorder.replayBlob) : null;
      const audioReplayUrl = recorder.audioBlob ? URL.createObjectURL(recorder.audioBlob) : null;
      appendPracticeReplay(sessionId, { replayUrl, audioReplayUrl });
      setTurnResults((prev) => [
        ...prev,
        { question: currentQ.text, transcript: result.transcript },
      ]);

      if (result.is_final) {
        trackEvent('final_results_viewed', {
          evaluation_pending: Boolean(result.evaluation_pending),
        });
        // Results/feedback live on SessionDetail now. `replace` so browser-back
        // doesn't return to this now-stateless recording page.
        navigate(`/sessions/${sessionId}?from=practice`, { replace: true });
      } else {
        setCurrentQ({
          text: result.next_question!,
          audioUrl: result.next_question_audio_url!,
          num: currentQ.num + 1,
          isFollowup: result.next_question_is_followup,
        });
        // Remount the <audio> (like Re-record / Restart) so the new question
        // routes through the same programmatic-play path instead of relying on
        // an unreliable src-diff autoplay.
        setReplayKey((k) => k + 1);
        recorder.reset();
        analyzer.reset();
      }
    } catch (err) {
      console.error('[Practice] submit turn failed', {
        question: currentQ.text,
        analyzerDiagnostics: analyzer.diagnostics,
        error: err,
      });

      // A usage-policy 422 is not transient — re-submitting the same audio
      // fails identically — so skip the one-shot auto-retry and go straight to
      // the "Restart turn" CTA.
      const policyViolation = isUsagePolicyViolation(err);
      trackEvent('turn_submit_failed', {
        turn_number: submittingTurnNumber,
        policy_violation: policyViolation,
        auto_retry: Boolean(autoSubmit && !autoRetriedRef.current && recorder.audioBlob && !policyViolation),
      });
      if (
        autoSubmit && !autoRetriedRef.current && recorder.audioBlob
        && !policyViolation
      ) {
        autoRetriedRef.current = true;
        setRetryingTurn(true);
        window.setTimeout(() => {
          setRetryingTurn(false);
          submitTurnRef.current();
        }, 1500);
        return;
      }

      setTurnError(formatTurnSubmitError(err));
      setTurnErrorIsPolicy(policyViolation);
    } finally {
      setSubmittingTurn(false);
    }
  }

  function handleReRecord() {
    recorder.reset();
    setReplayKey((k) => k + 1);
  }

  function handleEnd() {
    if (recorder.state !== 'recording') return;
    if (autoSubmit) setEndingTurn(true);
    recorder.stop();
    trackEvent('recording_stopped', {
      turn_number: currentQ?.num ?? 0,
      auto_submit_enabled: autoSubmit,
      elapsed_seconds: elapsedSeconds,
    });
  }

  function handleRestart() {
    if (recorder.state !== 'idle') recorder.stop();
    recorder.reset();
    setTurnError(null);
    setTurnErrorIsPolicy(false);
    setEndingTurn(false);
    setReplayKey((k) => k + 1);
  }

  function handleAudioEnded() {
    if (recorder.state !== 'idle') return;
    // Tear the question audio down synchronously, BEFORE recorder.start()'s
    // getUserMedia flips the iOS AVAudioSession to record mode. Detaching the
    // source (not just pausing) is what stops WebKit replaying the buffer on
    // the session-category switch. React diffs `src` against its own last
    // committed value, so the next audioUrl/replayKey change re-applies a
    // source and the play effect refires — the element is never stranded.
    const el = questionAudioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
      el.removeAttribute('src');
      el.load();
    }
    // Zero the clock here (the only place recording begins) so the timer
    // effect starts from 0 with no synchronous setState inside the effect.
    setElapsedSeconds(0);
    recorder.start({ video: deliveryAnalyticsEnabled })
      .then(() => {
        trackEvent('recording_started', {
          turn_number: currentQ?.num ?? 0,
          delivery_analytics_enabled: deliveryAnalyticsEnabled,
        });
      })
      .catch((err: Error) => {
        setTurnError(`Could not start recording: ${err.message}`);
        trackEvent('recording_start_failed', {
          turn_number: currentQ?.num ?? 0,
          delivery_analytics_enabled: deliveryAnalyticsEnabled,
        });
      });
  }

  async function handleQuit() {
    if (recorder.state !== 'idle') recorder.stop();
    recorder.reset();

    // Zero completed turns → nothing to grade: a plain client-side abandon
    // (no backend record, no daily-limit charge), the legacy behavior.
    if (turnResults.length === 0) {
      clearPracticeReplays(sessionId);
      navigate('/');
      return;
    }

    // ≥ 1 completed turn → keep the session and grade it on those turns. Fire
    // the early-end finalize, then land on SessionDetail and poll for scores,
    // exactly like the normal final-turn path.
    setEndingSession(true);
    setEndSessionError(null);
    try {
      await apiFetch(`/api/v1/sessions/${sessionId}/end`, { method: 'POST' });
      trackEvent('session_ended_early', {
        completed_turns: turnResults.length,
        total_turns: totalTurns,
      });
      clearPracticeReplays(sessionId);
      navigate(`/sessions/${sessionId}?from=practice`, { replace: true });
    } catch (err) {
      console.error('[Practice] end session early failed', err);
      setEndSessionError(
        'Could not save your session. Check your connection and try again.',
      );
      setEndingSession(false);
    }
  }

  // Interview phase deliberately hides TopBar for a focused recording mode.
  const submitting = submittingTurn || endingTurn || retryingTurn;
  const spinnerMessage = retryingTurn
    ? 'Retrying…'
    : currentQ && currentQ.num >= totalTurns
      ? 'Feedback will appear shortly.'
      : 'Analyzing — 5–10 seconds';
  const showPreview =
    !autoSubmit && recorder.state === 'stopped' && recorder.audioUrl != null;
  // Recording-length notice rendered UNDER the camera box. Warning from 4:00,
  // live countdown from 4:30 to the 5:00 auto-stop. Countdown wording differs
  // by mode: auto-submit "submits", manual "ends" (drops into the preview).
  const secondsRemaining = Math.max(0, RECORDING_MAX_SECONDS - elapsedSeconds);
  let recordingNotice: RecordingNotice | null = null;
  if (recorder.state === 'recording') {
    if (elapsedSeconds >= RECORDING_COUNTDOWN_SECONDS) {
      recordingNotice = {
        tone: 'countdown',
        text: autoSubmit
          ? `Recording automatically submits in ${secondsRemaining}s`
          : `Recording automatically ends in ${secondsRemaining}s`,
      };
    } else if (elapsedSeconds >= RECORDING_WARNING_SECONDS) {
      recordingNotice = {
        tone: 'warning',
        text: 'One minute warning — recording auto-stops at the 5-minute limit.',
      };
    }
  }
  // Pre-start heads-up under the camera box while the FIRST question plays, so
  // the candidate learns the 5-minute cap before recording begins. Turn 1 only
  // (the in-recording RecordingNotice covers later turns); hidden once recording
  // starts (state leaves 'idle').
  const showFirstTurnHint = recorder.state === 'idle' && currentQ?.num === 1;
  const previousTurn = turnResults.length > 0 ? turnResults[turnResults.length - 1] : null;
  const showTranscriptPanel = showTranscript && previousTurn;
  const showQuestionDuringSession = showQuestionText;

  if (!currentQ) return null;

  return (
    <div className="relative flex h-screen w-full flex-col bg-surface text-text">
      {showSessionInfo && (
        <SessionInfoPanel
          turnNum={currentQ.num}
          recorderState={recorder.state}
          diagnostics={analyzer.diagnostics}
        />
      )}
      <div
        className={cn(
          'flex-1 overflow-y-auto min-[900px]:overflow-hidden',
          'flex flex-col min-[900px]:grid min-[900px]:h-full',
          showTranscriptPanel
            ? 'min-[900px]:grid-cols-[25%_50%_25%]'
            : 'min-[900px]:grid-cols-[33%_67%]',
        )}
      >
        <QuestionColumn
          questionText={currentQ.text}
          isFollowup={currentQ.isFollowup}
          audioUrl={currentQ.audioUrl}
          showQuestionText={showQuestionDuringSession}
          replayKey={replayKey}
          audioRef={questionAudioRef}
          onAudioEnded={handleAudioEnded}
        />
        <CameraColumn
          videoStream={recorder.videoStream}
          recorderState={recorder.state}
          replayUrl={recorder.replayUrl}
          audioUrl={recorder.audioUrl}
          showPreview={showPreview}
          submitting={submitting}
          isFinalTurn={currentQ.num >= totalTurns}
          recordingNotice={recordingNotice}
          firstTurnHint={showFirstTurnHint}
          cameraError={cameraError}
          onSubmitPreview={handleSubmitTurn}
          onReRecordPreview={handleReRecord}
        />
        {showTranscriptPanel && (
          <TranscriptColumn
            question={previousTurn.question}
            transcript={previousTurn.transcript}
            onClose={() => setShowTranscript(false)}
          />
        )}
      </div>

      {turnError && (
        <div className="border-t border-border bg-surface-raised px-6 py-3 min-[900px]:px-10">
          <p role="alert" className="text-sm text-text-muted">
            <span className="mr-2 text-eyebrow uppercase tracking-eyebrow text-text">Error</span>
            {turnError}
          </p>
          {autoSubmit && recorder.audioBlob && (
            <div className="mt-2">
              {turnErrorIsPolicy ? (
                // Re-submitting the same audio would fail the same policy
                // check — reset the turn so the user records a fresh answer.
                <Button type="button" onClick={handleRestart}>
                  Restart turn
                </Button>
              ) : (
                <Button type="button" onClick={() => { void handleSubmitTurn(); }}>
                  Retry submission
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {cameraError && (
        <div className="border-t border-border bg-surface-raised px-6 py-3 min-[900px]:px-10">
          <p role="status" className="flex items-start gap-2 text-sm text-text-muted">
            {/* Amber dot = warning garnish (amber never as type in light mode). */}
            <span
              aria-hidden="true"
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-highlight"
            />
            <span>
              <span className="mr-2 text-eyebrow uppercase tracking-eyebrow text-text">Camera</span>
              {cameraError === 'failed'
                ? 'Your camera didn’t start, so this answer is audio-only and won’t receive a delivery score. Use “Restart turn” to try again.'
                : 'Camera access is blocked, so this answer is audio-only and won’t receive a delivery score.'}
            </span>
          </p>
        </div>
      )}

      <PracticeFooter
        turnNum={currentQ.num}
        totalTurns={totalTurns}
        recorderState={recorder.state}
        showQuestionText={showQuestionDuringSession}
        showTranscript={Boolean(showTranscriptPanel)}
        canShowTranscript={previousTurn != null}
        submitting={submitting}
        spinnerMessage={spinnerMessage}
        canEnd={recorder.state === 'recording'}
        onEnd={handleEnd}
        onRestart={handleRestart}
        onToggleQuestion={() => setShowQuestionText((v) => !v)}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
        onQuit={() => {
          setEndSessionError(null);
          setShowQuitConfirm(true);
        }}
      />

      <QuitConfirmDialog
        open={showQuitConfirm}
        completedTurns={turnResults.length}
        busy={endingSession}
        error={endSessionError}
        onCancel={() => {
          if (endingSession) return;
          setShowQuitConfirm(false);
        }}
        onConfirm={handleQuit}
      />
    </div>
  );
}
