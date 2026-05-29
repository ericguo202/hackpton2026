/**
 * Practice — runs an active 2-turn interview session.
 *
 * Phase 1 (interview): question audio plays → recorder auto-starts on
 *                      ended → user stops → submit → repeat for turn 2
 * Phase 2 (results):   folder-tab case-file shell — Overview tab + one
 *                      Turn tab per turn. Reuses the SessionDetail
 *                      `FolderTabs` / `SideNavButton` and inner-card
 *                      primitives, plus Practice-only `VideoReplayCard`
 *                      and `ImproveNextCard` for the 3-row turn layout.
 *
 * Mounted at `/practice`. Reads the initial `sessionId` and first
 * question (text + audio URL) from `useLocation().state`, populated by
 * `Home`'s start-session handler. If state is missing (refresh, direct
 * URL, browser-back into a stale `/practice`), redirects to `/`.
 *
 * The Interview → Results transition keeps `useMorphTransition` because
 * both phases live in this single component. Cross-route morph (Setup →
 * Practice) was deliberately dropped during the React Router migration.
 */

import { useEffect, useRef, useState } from 'react';
import { UserButton } from '@clerk/react';
import { Navigate, useLocation, useNavigate } from 'react-router';

import PageMorphTransition from '../components/PageMorphTransition';
import { PracticeFooter } from '../components/PracticeFooter';
import { QuitConfirmDialog } from '../components/QuitConfirmDialog';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { CameraColumn } from '../components/practice/CameraColumn';
import { QuestionColumn } from '../components/practice/QuestionColumn';
import { TranscriptColumn } from '../components/practice/TranscriptColumn';
import { PracticeOverviewPanel } from '../components/practice/PracticeOverviewPanel';
import { PracticeTurnPanel, type PracticeTurnReplay } from '../components/practice/PracticeTurnPanel';
import {
  FolderTabs,
  SideNavButton,
  type FolderTab,
} from '../components/session-detail/FolderTabs';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useApi } from '../hooks/useApi';
import { useFaceAnalyzer, type AnalyzerDiagnostics } from '../hooks/useFaceAnalyzer';
import { useLocalStoragePref } from '../hooks/useLocalStoragePref';
import { useMorphTransition } from '../hooks/useMorphTransition';
import { useRecorder } from '../hooks/useRecorder';
import { ApiError } from '../lib/api';
import { cn } from '../lib/utils';
import type { InterviewSummary } from '../lib/faceHeuristics';
import type { DimensionAverages, SessionDetail, TurnDetail } from '../types/history';
import type { Scores, TurnResult } from '../types/session';

export type PracticeLocationState = {
  sessionId: string;
  firstQuestion: string;
  firstQuestionAudioUrl: string;
  /** Echoed from the Setup form so the Results overview can identify the
   *  session without waiting for the SessionDetail refetch. */
  company: string;
  jobTitle: string;
};

type CurrentQ = { text: string; audioUrl: string; num: number };

type ReplayTurnResult = TurnResult & {
  question: string;
  cvSummary: InterviewSummary | null;
  replayUrl: string | null;
  audioReplayUrl: string | null;
  analyzerDiagnostics: AnalyzerDiagnostics;
};

const SCORE_DIM_KEYS: ReadonlyArray<keyof Scores> = [
  'structure',
  'problem_solving',
  'impact',
  'initiative',
  'depth',
  'delivery',
];

/**
 * Synthesize a `TurnDetail` from a locally-captured `ReplayTurnResult`.
 * Used as the fallback when the post-finalize SessionDetail refetch fails
 * so the Results panels always have a TurnDetail to render.
 */
function replayToTurnDetail(replay: ReplayTurnResult, idx: number): TurnDetail {
  return {
    id: `local-${idx}`,
    turn_number: idx + 1,
    question_text: replay.question,
    transcript_text: replay.transcript,
    is_followup: idx > 0,
    scores: replay.scores ?? {
      structure: null,
      problem_solving: null,
      impact: null,
      initiative: null,
      depth: null,
      delivery: null,
    },
    feedback: replay.feedback,
    feedback_detail: replay.feedback_detail,
    filler_word_count: replay.filler_word_count,
    filler_word_breakdown: replay.filler_word_breakdown,
    evaluated_at: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Compute wire-format averages (string-encoded Decimals, matching the
 * backend's `DimensionAverages` shape) from the locally-captured turn
 * results. Used only on the refetch-failed fallback path.
 */
function localAverages(turns: ReplayTurnResult[]): DimensionAverages {
  const out: Partial<Record<keyof Scores, string | null>> = {};
  for (const key of SCORE_DIM_KEYS) {
    const vals = turns
      .map((t) => t.scores?.[key])
      .filter((v): v is number => typeof v === 'number');
    out[key] = vals.length === 0
      ? null
      : (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
  }
  return out as DimensionAverages;
}

function replayFor(r: ReplayTurnResult | undefined): PracticeTurnReplay {
  if (!r) {
    return {
      replayUrl: null,
      audioReplayUrl: null,
      cvSummary: null,
      analyzerDiagnostics: {
        isReady: false,
        status: 'idle',
        initError: null,
        framesProcessed: 0,
        faceFrames: 0,
        lastSummary: null,
      },
    };
  }
  return {
    replayUrl: r.replayUrl,
    audioReplayUrl: r.audioReplayUrl,
    cvSummary: r.cvSummary,
    analyzerDiagnostics: r.analyzerDiagnostics,
  };
}

function revokeReplayUrls(turns: ReplayTurnResult[]) {
  for (const turn of turns) {
    if (turn.replayUrl) URL.revokeObjectURL(turn.replayUrl);
    if (turn.audioReplayUrl) URL.revokeObjectURL(turn.audioReplayUrl);
  }
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
  const recorder = useRecorder();
  const analyzer = useFaceAnalyzer(
    recorder.videoStream,
    recorder.state === 'recording',
  );
  // Morph overlay for the Interview → Results phase change. In-phase
  // state swaps (recorder idle/recording/stopped/submitting) use the
  // lighter `anim-crossfade` class instead.
  const { trigger: triggerMorph, transitioning, transitionKey } = useMorphTransition();
  const turnResultsRef = useRef<ReplayTurnResult[]>([]);

  const [showQuestionText, setShowQuestionText] = useLocalStoragePref('show_question_text', true);
  // Off by default. When on, tapping "End answer" while recording fires the
  // auto-submit effect below and skips the preview/Re-record block entirely.
  const [autoSubmit] = useLocalStoragePref('auto_submit_enabled', false);

  const [sessionId] = useState<string>(initial.sessionId);
  const [currentQ, setCurrentQ] = useState<CurrentQ | null>({
    text: initial.firstQuestion,
    audioUrl: initial.firstQuestionAudioUrl,
    num: 1,
  });
  const [turnResults, setTurnResults] = useState<ReplayTurnResult[]>([]);
  const [submittingTurn, setSubmittingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [retryingTurn, setRetryingTurn] = useState(false);
  const [isDone, setIsDone] = useState(false);
  // Source of truth for the Results-phase panels. Populated by the final-turn
  // refetch in handleSubmitTurn. If the refetch fails, falls back to a
  // synthesized session built from local `turnResults` via `replayToTurnDetail`.
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [endingTurn, setEndingTurn] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  useEffect(() => {
    turnResultsRef.current = turnResults;
  }, [turnResults]);

  useEffect(() => {
    return () => {
      revokeReplayUrls(turnResultsRef.current);
    };
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

  async function handleSubmitTurn() {
    if (!recorder.audioBlob || !sessionId || !currentQ) return;
    setSubmittingTurn(true);
    setEndingTurn(false);
    setTurnError(null);
    try {
      const form = new FormData();
      form.append('audio', recorder.audioBlob, 'answer.webm');

      const cvSummary = analyzer.buildSummary();
      if (cvSummary) {
        form.append('cv_summary', JSON.stringify(cvSummary));
      } else {
        console.warn('[Practice] cv_summary missing on submit', analyzer.diagnostics);
      }

      const formEntries = Array.from(form.entries()).map(([key, value]) => {
        if (value instanceof File) {
          return {
            key,
            kind: 'file',
            name: value.name,
            type: value.type,
            size: value.size,
          };
        }
        const textValue = String(value);
        return {
          key,
          kind: 'text',
          length: textValue.length,
          preview: textValue.slice(0, 160),
        };
      });

      console.groupCollapsed(`[Practice] submit turn ${currentQ.num}`);
      console.log('[Practice] current question', currentQ.text);
      console.log('[Practice] recorder state before submit', {
        hasAudioBlob: Boolean(recorder.audioBlob),
        audioBlobSize: recorder.audioBlob?.size ?? 0,
        audioBlobType: recorder.audioBlob?.type ?? null,
        hasReplayBlob: Boolean(recorder.replayBlob),
        replayBlobSize: recorder.replayBlob?.size ?? 0,
        replayBlobType: recorder.replayBlob?.type ?? null,
      });
      console.log('[Practice] analyzer diagnostics before submit', analyzer.diagnostics);
      console.log('[Practice] cvSummary before submit', cvSummary);
      console.log('[Practice] FormData entries', formEntries);

      const result = await apiFetch<TurnResult>(
        `/api/v1/sessions/${sessionId}/turns`,
        { method: 'POST', body: form },
      );

      console.log('[Practice] API result', result);
      console.log('[Practice] delivery returned', {
        delivery: result.scores?.delivery ?? null,
        evaluationPending: result.evaluation_pending,
        hasCvSummary: cvSummary != null,
      });

      const replayUrl = recorder.replayBlob ? URL.createObjectURL(recorder.replayBlob) : null;
      const audioReplayUrl = recorder.audioBlob ? URL.createObjectURL(recorder.audioBlob) : null;
      const enriched: ReplayTurnResult = {
        ...result,
        question: currentQ.text,
        cvSummary,
        replayUrl,
        audioReplayUrl,
        analyzerDiagnostics: {
          ...analyzer.diagnostics,
          lastSummary: cvSummary,
        },
      };

      console.log('[Practice] enriched replay turn result', {
        question: enriched.question,
        scores: enriched.scores,
        hasReplayUrl: Boolean(enriched.replayUrl),
        hasAudioReplayUrl: Boolean(enriched.audioReplayUrl),
        analyzerDiagnostics: enriched.analyzerDiagnostics,
        cvSummary: enriched.cvSummary,
      });
      console.groupEnd();

      setTurnResults((prev) => [...prev, enriched]);

      if (result.is_final) {
        // Pull the full session payload — it carries the canonical scores
        // for turn 1 (which POSTed back null while the evaluator ran in the
        // background) plus the company brief shown on the Overview tab.
        // If the refetch fails, the Results phase still renders from the
        // locally-captured `turnResults` via the `replayToTurnDetail`
        // adapter — turn 1 will show "Evaluation failed" in that case.
        try {
          const detail = await apiFetch<SessionDetail>(
            `/api/v1/sessions/${sessionId}`,
          );
          setSessionDetail(detail);
        } catch (err) {
          console.warn(
            '[Practice] post-finalize session detail refetch failed; '
            + 'Results panels will render from local turn data only.',
            err,
          );
        }
        triggerMorph(() => {
          setIsDone(true);
          setCurrentQ(null);
        });
      } else {
        setCurrentQ({
          text: result.next_question!,
          audioUrl: result.next_question_audio_url!,
          num: currentQ.num + 1,
        });
        recorder.reset();
        analyzer.reset();
      }
    } catch (err) {
      console.error('[Practice] submit turn failed', {
        question: currentQ.text,
        analyzerDiagnostics: analyzer.diagnostics,
        error: err,
      });
      console.groupEnd();

      if (autoSubmit && !autoRetriedRef.current && recorder.audioBlob) {
        autoRetriedRef.current = true;
        setRetryingTurn(true);
        window.setTimeout(() => {
          setRetryingTurn(false);
          submitTurnRef.current();
        }, 1500);
        return;
      }

      setTurnError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : (err as Error).message,
      );
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
  }

  function handleRestart() {
    if (recorder.state !== 'idle') recorder.stop();
    recorder.reset();
    setTurnError(null);
    setEndingTurn(false);
    setReplayKey((k) => k + 1);
  }

  function handleAudioEnded() {
    if (recorder.state !== 'idle') return;
    recorder.start().catch((err: Error) => {
      setTurnError(`Could not start recording: ${err.message}`);
    });
  }

  function handleQuit() {
    if (recorder.state !== 'idle') recorder.stop();
    recorder.reset();
    navigate('/');
  }

  // Touch-swipe to switch tabs on mobile in the Results phase. Commit a
  // tab change only when the horizontal delta dominates and exceeds the
  // threshold so a normal vertical scroll inside an inner card doesn't
  // accidentally page. Mirrors SessionDetail.tsx.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleResultsTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleResultsTouchEnd(
    e: React.TouchEvent,
    tabsLen: number,
    activeIndex: number,
  ) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && activeIndex < tabsLen - 1) {
      setActiveTabIndex(activeIndex + 1);
    } else if (dx > 0 && activeIndex > 0) {
      setActiveTabIndex(activeIndex - 1);
    }
  }

  // Interview phase deliberately hides TopBar for a focused recording mode.
  const submitting = submittingTurn || endingTurn || retryingTurn;
  const spinnerMessage = retryingTurn
    ? 'Retrying…'
    : currentQ && currentQ.num >= 2
      ? 'Scoring — up to 40 seconds'
      : 'Analyzing — 5–10 seconds';
  const showPreview =
    !autoSubmit && recorder.state === 'stopped' && recorder.audioUrl != null;
  const previousTurn = turnResults.length > 0 ? turnResults[0] : null;

  return (
    <div className="flex min-h-screen flex-col bg-surface text-text">
      {isDone && (
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
      )}

      <main className="flex-1">
        {!isDone && currentQ && (
          <div className="flex h-screen w-full flex-col bg-surface">
            <div
              className={cn(
                'flex-1 overflow-y-auto min-[900px]:overflow-hidden',
                'flex flex-col min-[900px]:grid min-[900px]:h-full',
                showTranscript && previousTurn
                  ? 'min-[900px]:grid-cols-[25%_50%_25%]'
                  : 'min-[900px]:grid-cols-[33%_67%]',
              )}
            >
              <QuestionColumn
                questionText={currentQ.text}
                audioUrl={currentQ.audioUrl}
                showQuestionText={showQuestionText}
                replayKey={replayKey}
                onAudioEnded={handleAudioEnded}
              />
              <CameraColumn
                videoStream={recorder.videoStream}
                recorderState={recorder.state}
                replayUrl={recorder.replayUrl}
                audioUrl={recorder.audioUrl}
                showPreview={showPreview}
                submitting={submitting}
                isFinalTurn={currentQ.num >= 2}
                onSubmitPreview={handleSubmitTurn}
                onReRecordPreview={handleReRecord}
              />
              {showTranscript && previousTurn && (
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
                    <FlowHoverButton type="button" onClick={() => { void handleSubmitTurn(); }}>
                      Retry submission
                    </FlowHoverButton>
                  </div>
                )}
              </div>
            )}

            <PracticeFooter
              turnNum={currentQ.num}
              recorderState={recorder.state}
              showQuestionText={showQuestionText}
              showTranscript={showTranscript}
              canShowTranscript={previousTurn != null}
              submitting={submitting}
              spinnerMessage={spinnerMessage}
              canEnd={recorder.state === 'recording'}
              onEnd={handleEnd}
              onRestart={handleRestart}
              onToggleQuestion={() => setShowQuestionText((v) => !v)}
              onToggleTranscript={() => setShowTranscript((v) => !v)}
              onQuit={() => setShowQuitConfirm(true)}
            />

            <QuitConfirmDialog
              open={showQuitConfirm}
              onCancel={() => setShowQuitConfirm(false)}
              onConfirm={handleQuit}
            />
          </div>
        )}

        {isDone && (() => {
          // Resolve session-level data: prefer the server refetch, fall
          // back to a locally-synthesized view if the refetch failed.
          const effectiveTurns: TurnDetail[] = sessionDetail
            ? sessionDetail.turns
            : turnResults.map(replayToTurnDetail);
          const effectiveAverages: DimensionAverages = sessionDetail
            ? sessionDetail.averages
            : localAverages(turnResults);
          const effectiveCompany = sessionDetail?.company ?? initial.company;
          const effectiveJobTitle = sessionDetail?.job_title ?? initial.jobTitle;

          const tabs: FolderTab[] = [
            { label: 'Overview', tabId: 'pr-tab-overview', panelId: 'pr-panel-overview' },
            ...effectiveTurns.map((_, i) => ({
              label: `Turn ${i + 1}`,
              tabId: `pr-tab-turn-${i + 1}`,
              panelId: `pr-panel-turn-${i + 1}`,
            })),
          ];

          const safeIndex = Math.min(activeTabIndex, Math.max(0, tabs.length - 1));
          const prevTab = safeIndex > 0 ? tabs[safeIndex - 1] : null;
          const nextTab = safeIndex < tabs.length - 1 ? tabs[safeIndex + 1] : null;

          return (
            <div className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-6 min-[900px]:px-16 py-8 min-[900px]:py-12">
              <div className="flex items-stretch gap-3 min-[900px]:gap-4">
                {/* Sticky-to-viewport-middle left chevron. items-start is
                    load-bearing: with items-center the natural position
                    sits well below sticky's top: 50vh threshold on a tall
                    card, so the constraint stays satisfied and sticky
                    never engages. See frontend/CLAUDE.md "SessionDetail
                    folder-tab shell" for the full explanation. */}
                <div className="hidden min-[900px]:flex items-start">
                  <div className="sticky top-[50vh] -translate-y-1/2">
                    <SideNavButton
                      direction="prev"
                      onClick={() => prevTab && setActiveTabIndex(safeIndex - 1)}
                      targetLabel={prevTab?.label ?? ''}
                      hidden={prevTab === null}
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <p className="min-[900px]:hidden mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                    {tabs[safeIndex]?.label} · {safeIndex + 1} of {tabs.length}
                  </p>

                  <FolderTabs
                    tabs={tabs}
                    activeIndex={safeIndex}
                    onChange={setActiveTabIndex}
                  />

                  <section
                    key={safeIndex}
                    id={tabs[safeIndex]?.panelId}
                    role="tabpanel"
                    aria-labelledby={tabs[safeIndex]?.tabId}
                    onTouchStart={handleResultsTouchStart}
                    onTouchEnd={(e) => handleResultsTouchEnd(e, tabs.length, safeIndex)}
                    className="anim-crossfade rounded-lg border border-border-strong bg-tertiary-200 min-[900px]:rounded-tl-none"
                  >
                    {safeIndex === 0 ? (
                      <PracticeOverviewPanel
                        company={effectiveCompany}
                        jobTitle={effectiveJobTitle}
                        averages={effectiveAverages}
                        turns={effectiveTurns}
                      />
                    ) : (
                      <PracticeTurnPanel
                        turn={effectiveTurns[safeIndex - 1]}
                        turnNum={safeIndex}
                        replay={replayFor(turnResults[safeIndex - 1])}
                      />
                    )}
                  </section>

                  <div className="min-[900px]:hidden mt-6 flex items-center justify-between gap-3">
                    {prevTab ? (
                      <FlowHoverButton
                        variant="dark"
                        type="button"
                        onClick={() => setActiveTabIndex(safeIndex - 1)}
                      >
                        ← Prev: {prevTab.label}
                      </FlowHoverButton>
                    ) : (
                      <div className="flex-1" />
                    )}
                    {nextTab ? (
                      <FlowHoverButton
                        type="button"
                        onClick={() => setActiveTabIndex(safeIndex + 1)}
                      >
                        Next: {nextTab.label} →
                      </FlowHoverButton>
                    ) : (
                      <div className="flex-1" />
                    )}
                  </div>
                </div>

                <div className="hidden min-[900px]:flex items-start">
                  <div className="sticky top-[50vh] -translate-y-1/2">
                    <SideNavButton
                      direction="next"
                      onClick={() => nextTab && setActiveTabIndex(safeIndex + 1)}
                      targetLabel={nextTab?.label ?? ''}
                      hidden={nextTab === null}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </main>

      {transitioning && (
        <PageMorphTransition key={transitionKey} />
      )}
    </div>
  );
}
