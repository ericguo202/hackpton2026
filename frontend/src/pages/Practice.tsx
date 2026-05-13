/**
 * Practice — runs an active 2-turn interview session.
 *
 * Phase 1 (interview): question audio plays → recorder auto-starts on
 *                      ended → user stops → submit → repeat for turn 2
 * Phase 2 (results):   per-turn scores + replay coach cards, navigated
 *                      via stepped slide animation
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { UserButton } from '@clerk/react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CameraPreview } from '../components/CameraPreview';
import PageMorphTransition from '../components/PageMorphTransition';
import QuestionPlayer from '../components/QuestionPlayer';
import ScoreDimensions from '../components/ScoreDimensions';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useApi } from '../hooks/useApi';
import { useFaceAnalyzer, type AnalyzerDiagnostics } from '../hooks/useFaceAnalyzer';
import { useLocalStoragePref } from '../hooks/useLocalStoragePref';
import { useMorphTransition } from '../hooks/useMorphTransition';
import { useRecorder } from '../hooks/useRecorder';
import { ApiError } from '../lib/api';
import { fillerBreakdown, tokenizeTranscript } from '../lib/fillerWords';
import { getReplayFaceLandmarker } from '../lib/faceLandmarker';
import type { InterviewSummary } from '../lib/faceHeuristics';
import type { SessionDetail } from '../types/history';
import type { Scores, TurnResult } from '../types/session';

export type PracticeLocationState = {
  sessionId: string;
  firstQuestion: string;
  firstQuestionAudioUrl: string;
};

type CurrentQ = { text: string; audioUrl: string; num: number };

type ReplayTurnResult = TurnResult & {
  question: string;
  cvSummary: InterviewSummary | null;
  replayUrl: string | null;
  audioReplayUrl: string | null;
  analyzerDiagnostics: AnalyzerDiagnostics;
};

type Insight = {
  title: string;
  detail: string;
};

const SCORE_LABELS: Record<keyof Scores, string> = {
  directness: 'Directness',
  star: 'STAR structure',
  specificity: 'Specificity',
  impact: 'Impact',
  conciseness: 'Conciseness',
  delivery: 'Delivery',
};

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

function getScoreEntries(scores: Scores | null) {
  if (scores == null) return [];
  return (Object.entries(scores) as Array<[keyof Scores, number | null]>)
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({
      key,
      label: SCORE_LABELS[key],
      value: value as number,
    }));
}

function computeOverall(result: ReplayTurnResult): string {
  const values = getScoreEntries(result.scores).map((entry) => entry.value);
  return values.length
    ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
    : '-';
}

function computeAverageScores(turns: ReplayTurnResult[]):
  Array<{ key: keyof Scores; label: string; value: number | null }> {
  const totals: Partial<Record<keyof Scores, { sum: number; count: number }>> = {};
  for (const turn of turns) {
    for (const entry of getScoreEntries(turn.scores)) {
      const agg = totals[entry.key] ?? { sum: 0, count: 0 };
      agg.sum += entry.value;
      agg.count += 1;
      totals[entry.key] = agg;
    }
  }
  return (Object.keys(SCORE_LABELS) as Array<keyof Scores>).map((key) => {
    const agg = totals[key];
    return {
      key,
      label: SCORE_LABELS[key],
      value: agg ? agg.sum / agg.count : null,
    };
  });
}

function getAnalyzerStatusLabel(status: AnalyzerDiagnostics['status']) {
  switch (status) {
    case 'warming':
      return 'warming model';
    case 'ready':
      return 'ready';
    case 'running':
      return 'tracking face';
    case 'no-face':
      return 'no face detected';
    case 'error':
      return 'analyzer error';
    default:
      return 'idle';
  }
}

function getAnalyzerStatusClass(status: AnalyzerDiagnostics['status']) {
  switch (status) {
    case 'running':
      return 'bg-green-600';
    case 'no-face':
      return 'bg-amber-500';
    case 'error':
      return 'bg-red-500';
    case 'warming':
      return 'bg-blue-500';
    case 'ready':
      return 'bg-accent';
    default:
      return 'bg-text-subtle';
  }
}

function buildReplayInsights(result: ReplayTurnResult): Insight[] {
  const insights: Insight[] = [];

  if (result.scores == null) {
    insights.push({
      title: 'Scores unavailable',
      detail: 'The evaluator did not complete in time for this turn. Re-run the session to score this answer.',
    });
    return insights;
  }

  const entries = getScoreEntries(result.scores);
  const weakest = [...entries].sort((a, b) => a.value - b.value)[0];
  const strongest = [...entries].sort((a, b) => b.value - a.value)[0];

  if (weakest) {
    insights.push({
      title: `Most room to improve: ${weakest.label}`,
      detail: `${weakest.value}/10. Tighten this dimension first on your next take.`,
    });
  }

  if (strongest) {
    insights.push({
      title: `Keep this strength: ${strongest.label}`,
      detail: `${strongest.value}/10. This is the part of your answer style worth preserving.`,
    });
  }

  if (result.filler_word_count > 0) {
    insights.push({
      title: 'Trim filler words',
      detail: `${result.filler_word_count} filler words showed up in this turn. Click "Show Transcript" to view where you used them.`,
    });
  }

  if (result.cvSummary) {
    if (result.cvSummary.face_visible_pct < 85) {
      insights.push({
        title: 'Stay inside the frame',
        detail: `Face visibility was ${result.cvSummary.face_visible_pct}%. Keep your head centered so delivery scoring has a stable read.`,
      });
    }
    if (result.cvSummary.eye_contact_score < 55) {
      insights.push({
        title: 'Hold eye contact longer',
        detail: `Eye contact landed at ${result.cvSummary.eye_contact_score}/100. Pick one spot near the camera and return to it between phrases.`,
      });
    }
    if (result.cvSummary.expression_score < 50) {
      insights.push({
        title: 'Add more facial energy',
        detail: `Expression scored ${result.cvSummary.expression_score}/100. A small smile and slightly more open eyes will read as more engaged.`,
      });
    }
  } else {
    insights.push({
      title: 'Delivery score unavailable',
      detail: result.analyzerDiagnostics.framesProcessed > 0
        ? 'The browser captured camera frames, but no usable summary was produced before submit.'
        : 'No analyzer frames were processed for this turn, so delivery could not be scored.',
    });
  }

  if (result.feedback) {
    insights.push({
      title: 'Model note',
      detail: result.feedback,
    });
  }

  return insights.slice(0, 4);
}

function turnAverage(result: TurnResult): number {
  if (result.scores == null) return 0;
  const vals = Object.values(result.scores).filter(
    (v): v is number => typeof v === 'number',
  );
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function ReplayLandmarkOverlay({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    let lastTickMs = 0;
    const DRAW_MIN_MS = 1000 / 10;

    const draw = async (tMs: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(draw);
      const deltaMs = lastTickMs === 0 ? DRAW_MIN_MS : tMs - lastTickMs;
      if (deltaMs < DRAW_MIN_MS) return;
      lastTickMs = tMs;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const landmarker = await getReplayFaceLandmarker();
        const result = landmarker.detect(video);
        const face = result.faceLandmarks[0];
        if (!face?.length) return;

        ctx.save();
        for (let index = 0; index < face.length; index += 1) {
          const landmark = face[index];
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          const isIris = index >= 468;
          ctx.beginPath();
          ctx.arc(x, y, isIris ? 2.2 : 1.1, 0, Math.PI * 2);
          ctx.fillStyle = isIris
            ? 'rgba(255, 214, 102, 0.95)'
            : 'rgba(84, 200, 255, 0.85)';
          ctx.fill();
        }
        ctx.restore();
      } catch (error) {
        console.warn('[ReplayLandmarkOverlay] draw failed:', error);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}

function FillerBreakdownChart({ transcript }: { transcript: string }) {
  const data = useMemo(() => fillerBreakdown(transcript), [transcript]);

  if (data.length === 0) {
    return (
      <div className="flex items-start">
        <p className="text-sm text-text-muted">
          No filler words detected in this answer.
        </p>
      </div>
    );
  }

  const rowHeight = 28;
  const height = Math.min(Math.max(data.length * rowHeight + 48, 140), 320);
  const maxCount = data[0]?.count ?? 1;

  return (
    <div>
      <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Filler distribution
      </p>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 24, bottom: 4, left: 0 }}
            barCategoryGap={6}
          >
            <XAxis
              type="number"
              hide
              domain={[0, Math.max(maxCount, 1)]}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="word"
              width={84}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-raised)' }}
              contentStyle={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--color-text)' }}
              itemStyle={{ color: 'var(--color-text-muted)' }}
              formatter={(value) => [`${value ?? 0}×`, 'Count']}
            />
            <Bar
              dataKey="count"
              fill="rgb(239 68 68 / 0.6)"
              radius={[0, 3, 3, 0]}
              label={{
                position: 'right',
                fill: 'var(--color-text-muted)',
                fontSize: 11,
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ReplayCoachCard({ result, turnNum }: { result: ReplayTurnResult; turnNum: number }) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const insights = buildReplayInsights(result);
  const scoreEntries = getScoreEntries(result.scores);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <div className="max-w-[72rem]">
      <p className="mb-4 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Turn {turnNum}
      </p>
      <h3
        className="mb-4 max-w-[46rem] font-display font-medium leading-[1.1] tracking-[-0.01em] text-text"
        style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2.25rem)' }}
      >
        {result.question}
      </h3>
      <p className="mb-10 text-sm text-text-muted">
        Overall {computeOverall(result)}/10
        {result.scores?.delivery != null
          ? ` · Delivery ${result.scores.delivery}/10`
          : ' · Delivery unavailable'}
      </p>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.9fr)]">
        <div className="space-y-10">
          {result.replayUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface-sunken">
              <video
                ref={replayVideoRef}
                src={result.replayUrl}
                controls
                preload="metadata"
                className="h-full w-full object-cover"
              />
              {showOverlay && (
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(20,19,14,0.9)] via-[rgba(20,19,14,0.28)] to-transparent">
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <div className="mb-3 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
                      Model overlay
                    </div>
                    <p className="max-w-[48ch] text-sm leading-6 text-white/92">
                      {result.feedback ?? 'Coaching note unavailable for this turn.'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {insights.slice(0, 3).map((insight) => (
                        <span
                          key={insight.title}
                          className="rounded-full border border-white/16 bg-white/10 px-3 py-1.5 text-xs text-white/88"
                        >
                          {insight.title}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {showLandmarks && (
                <div className="pointer-events-none absolute inset-0">
                  <ReplayLandmarkOverlay videoRef={replayVideoRef} />
                </div>
              )}
              <div className="absolute right-3 top-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowOverlay((v) => !v)}
                  aria-pressed={showOverlay}
                  className="cursor-pointer rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/90 backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {showOverlay ? 'Hide notes' : 'Show notes'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLandmarks((v) => !v)}
                  aria-pressed={showLandmarks}
                  className="cursor-pointer rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/90 backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {showLandmarks ? 'Hide landmarks' : 'Show landmarks'}
                </button>
                <a
                  href={result.replayUrl}
                  download={`turn-${turnNum}.webm`}
                  className="cursor-pointer rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/90 backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  Download
                </a>
              </div>
            </div>
          ) : result.audioReplayUrl ? (
            <div className="rounded-2xl bg-surface-raised p-5">
              <p className="mb-3 text-sm text-text-muted">Video replay was unavailable, but the answer audio was saved.</p>
              <audio src={result.audioReplayUrl} controls className="w-full" />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-text-muted">
              Replay media was not available for this turn.
            </div>
          )}

          {scoreEntries.length > 0 && (
            <div>
              <p className="mb-5 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                Scores
              </p>
              <div className="grid grid-cols-3 gap-x-6 gap-y-7 sm:grid-cols-6">
                {scoreEntries.map((entry) => (
                  <div key={entry.key}>
                    <div className="font-display text-[2.25rem] font-medium leading-none tabular-nums text-text">
                      {entry.value}
                    </div>
                    <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${entry.value * 10}%` }}
                      />
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-eyebrow text-text-muted">
                      {entry.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <div className="space-y-10">
          {result.feedback && (
            <div>
              <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                Coach notes
              </p>
              <p className="text-[15px] leading-7 text-text">
                {result.feedback}
              </p>
            </div>
          )}

          {insights.length > 0 && (
            <div>
              <p className="mb-4 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                Improve next
              </p>
              <ul className="space-y-5">
                {insights.map((insight) => (
                  <li key={insight.title} className="border-l-2 border-accent/40 pl-4">
                    <p className="mb-1 text-sm font-medium text-text">{insight.title}</p>
                    <p className="text-sm leading-6 text-text-muted">{insight.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {result.transcript && (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="group inline-flex items-center gap-2 rounded text-eyebrow uppercase tracking-eyebrow text-text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {showTranscript ? 'Hide transcript' : 'Show transcript'}
            <span aria-hidden className={`transition-transform ${showTranscript ? 'rotate-180' : ''}`}>
              ↓
            </span>
          </button>
          {showTranscript && (
            <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
              <p className="max-w-[72ch] text-sm leading-7 text-text-muted">
                {tokenizeTranscript(result.transcript).map((tok, i) =>
                  tok.kind === 'filler' ? (
                    <span
                      key={i}
                      className="rounded-sm bg-red-500/30 px-1 text-red-900 decoration-red-700/50 underline-offset-2"
                      title={`Filler word: "${tok.canonical}"`}
                    >
                      {tok.text}
                    </span>
                  ) : (
                    <span key={i}>{tok.text}</span>
                  ),
                )}
              </p>
              <FillerBreakdownChart transcript={result.transcript} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function revokeReplayUrls(turns: ReplayTurnResult[]) {
  for (const turn of turns) {
    if (turn.replayUrl) URL.revokeObjectURL(turn.replayUrl);
    if (turn.audioReplayUrl) URL.revokeObjectURL(turn.audioReplayUrl);
  }
}

function mergeServerScores(
  local: ReplayTurnResult[],
  detail: SessionDetail,
): ReplayTurnResult[] {
  return local.map((turn, idx) => {
    const server = detail.turns[idx];
    if (!server) return turn;
    return {
      ...turn,
      scores: server.scores,
      feedback: server.feedback,
      filler_word_count: server.filler_word_count,
      filler_word_breakdown: server.filler_word_breakdown,
      evaluation_pending: false,
    };
  });
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
  const [resultsStep, setResultsStep] = useState(0);
  const [resultsStepKey, setResultsStepKey] = useState(0);
  const [resultsDirection, setResultsDirection] = useState<'forward' | 'back'>('forward');
  const [endingTurn, setEndingTurn] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

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
        // Pull the full session and overlay the now-evaluated scores onto
        // turn 1's placeholder (turn 1's POST returned null scores while
        // the evaluator ran in the background; the backend awaited it
        // before responding to turn 2).
        try {
          const detail = await apiFetch<SessionDetail>(
            `/api/v1/sessions/${sessionId}`,
          );
          setTurnResults((prev) => mergeServerScores(prev, detail));
        } catch (err) {
          console.warn(
            '[Practice] post-finalize session detail refetch failed; '
            + 'turn-1 placeholder will render the "Scores unavailable" '
            + 'fallback.',
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

  function goToResultsStep(next: number) {
    if (next === resultsStep) return;
    setResultsDirection(next > resultsStep ? 'forward' : 'back');
    setResultsStep(next);
    setResultsStepKey((k) => k + 1);
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

      <main className="flex-1">
        {!isDone && currentQ && (
          <div className="mx-auto w-full max-w-[80rem] px-8 py-16 md:px-16">
            <div className="max-w-[70rem]">
              <QuestionPlayer
                key={replayKey}
                question={currentQ.text}
                audioUrl={currentQ.audioUrl}
                questionNum={currentQ.num}
                showQuestion={showQuestionText}
                onToggleShowQuestion={() => setShowQuestionText((v) => !v)}
                onEnded={() => {
                  if (recorder.state !== 'idle') return;
                  recorder.start().catch((err: Error) => {
                    setTurnError(`Could not start recording: ${err.message}`);
                  });
                }}
              />

              {recorder.videoStream && (
                <div className="anim-crossfade mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
                  <CameraPreview stream={recorder.videoStream} />
                  <div className="rounded-2xl bg-surface-raised p-5">
                    <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                      Analyzer status
                    </p>
                    <div className="mb-4 flex items-center gap-3 text-sm text-text">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${getAnalyzerStatusClass(analyzer.diagnostics.status)}`} />
                      <span>{getAnalyzerStatusLabel(analyzer.diagnostics.status)}</span>
                    </div>
                    <div className="space-y-2 text-sm text-text-muted">
                      <p>Frames processed: {analyzer.diagnostics.framesProcessed}</p>
                      <p>Face frames: {analyzer.diagnostics.faceFrames}</p>
                      <p>Model ready: {analyzer.isReady ? 'yes' : 'not yet'}</p>
                      {analyzer.diagnostics.lastSummary && (
                        <>
                          <p>Live eye contact: {analyzer.diagnostics.lastSummary.eye_contact_score}/100</p>
                          <p>Live expression: {analyzer.diagnostics.lastSummary.expression_score}/100</p>
                        </>
                      )}
                      {analyzer.diagnostics.initError && (
                        <p className="text-red-600">Init error: {analyzer.diagnostics.initError}</p>
                      )}
                      {!analyzer.diagnostics.initError && analyzer.diagnostics.framesProcessed === 0 && (
                        <p>Waiting for the analyzer to accumulate enough live frames for delivery scoring.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-10 space-y-4">
                <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
                  Your answer
                </p>

                {(submittingTurn || endingTurn || retryingTurn) ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="anim-crossfade flex items-center gap-3 py-4 text-text-muted"
                  >
                    <Spinner size={20} />
                    <p className="text-sm">
                      {retryingTurn
                        ? 'The model briefly rejected the request. Retrying…'
                        : currentQ.num >= 2
                          ? 'Scoring your interview — this can take up to 40 seconds.'
                          : 'Analyzing your response — usually takes 5–10 seconds.'}
                    </p>
                  </div>
                ) : (
                  <>
                    {recorder.state === 'idle' && (
                      <p className="anim-crossfade text-sm text-text-subtle">
                        Recording will start automatically when the question finishes.
                      </p>
                    )}

                    {recorder.state === 'recording' && (
                      <div className="anim-crossfade flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-2 text-sm text-text">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          Recording
                        </span>
                        <FlowHoverButton
                          variant="dark"
                          type="button"
                          onClick={() => {
                            if (autoSubmit) setEndingTurn(true);
                            recorder.stop();
                          }}
                        >
                          {autoSubmit ? 'End answer' : 'Stop recording'}
                        </FlowHoverButton>
                      </div>
                    )}

                    {!autoSubmit && recorder.state === 'stopped' && recorder.audioUrl && (
                      <div className="anim-crossfade space-y-4">
                        {recorder.replayUrl ? (
                          <div className="aspect-video w-full max-w-md overflow-hidden rounded-2xl bg-surface-sunken">
                            <video src={recorder.replayUrl} controls className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <audio src={recorder.audioUrl} controls className="w-full max-w-md" />
                        )}
                        <div className="flex flex-wrap gap-3">
                          <FlowHoverButton
                            type="button"
                            onClick={handleSubmitTurn}
                          >
                            Submit answer
                          </FlowHoverButton>
                          <FlowHoverButton
                            variant="dark"
                            type="button"
                            onClick={handleReRecord}
                          >
                            Re-record
                          </FlowHoverButton>
                        </div>
                        <p className="text-xs text-text-subtle">
                          {analyzer.diagnostics.framesProcessed > 0
                            ? `Delivery capture armed: ${analyzer.diagnostics.framesProcessed} analyzer frames processed.`
                            : 'No analyzer frames were processed for this take, so delivery may come back unavailable.'}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {turnError && (
                  <div className="space-y-3">
                    <p role="alert" className="text-sm text-text-muted">
                      <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
                      {turnError}
                    </p>
                    {autoSubmit && recorder.audioBlob && (
                      <FlowHoverButton
                        type="button"
                        onClick={() => { void handleSubmitTurn(); }}
                      >
                        Retry submission
                      </FlowHoverButton>
                    )}
                  </div>
                )}
              </div>

              {turnResults.length > 0 && (
                <div
                  key={`transcript-${turnResults.length}`}
                  className="anim-crossfade mt-8 rounded-lg bg-surface-raised p-4"
                >
                  <p className="mb-1 text-[11px] uppercase tracking-eyebrow text-text-subtle">
                    Transcript (turn {turnResults.length})
                  </p>
                  <p className="text-xs leading-relaxed text-text-muted">
                    {turnResults.at(-1)!.transcript}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {isDone && (() => {
          const resultsTotalSteps = 1 + turnResults.length;
          const stepIndex = Math.min(resultsStep, resultsTotalSteps - 1);
          const isLastStep = stepIndex === resultsTotalSteps - 1;
          const isOverviewStep = stepIndex === 0;
          const activeTurn = isOverviewStep ? null : turnResults[stepIndex - 1];
          const averageScores = computeAverageScores(turnResults);
          const hasAnyAverage = averageScores.some((s) => s.value != null);
          return (
            <div className="mx-auto w-full max-w-[80rem] px-8 py-16 md:px-16">
              <div className="max-w-[72rem]">
                <div className="mb-10 flex items-center gap-3" role="tablist" aria-label="Results sections">
                  {Array.from({ length: resultsTotalSteps }).map((_, i) => {
                    const active = i === stepIndex;
                    const label = i === 0 ? 'Overview' : `Turn ${i}`;
                    return (
                      <button
                        key={i}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={label}
                        onClick={() => goToResultsStep(i)}
                        className={`h-2 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                          active ? 'w-10 bg-accent' : 'w-2 bg-border hover:bg-border-strong'
                        }`}
                      />
                    );
                  })}
                  <span className="ml-2 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                    {isOverviewStep ? 'Overview' : `Turn ${stepIndex} of ${turnResults.length}`}
                  </span>
                </div>

                <section
                  key={resultsStepKey}
                  className={resultsDirection === 'back' ? 'anim-slide-in-right' : 'anim-slide-in-left'}
                >
                  {isOverviewStep && (
                    <>
                      <p className="mb-6 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                        Session complete
                      </p>
                      <h2
                        className="mb-2 font-display font-medium leading-[1.05] tracking-[-0.02em] text-text"
                        style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
                      >
                        Here is how you did.
                      </h2>
                      <p className="mb-2 text-sm text-text-muted">
                        Overall:{' '}
                        <span className="font-medium text-text">
                          {turnResults.length > 0
                            ? (
                                turnResults.reduce((sum, r) => sum + turnAverage(r), 0) /
                                turnResults.length
                              ).toFixed(1)
                            : '—'}
                          /10
                        </span>{' '}
                        averaged across {turnResults.length} turn{turnResults.length === 1 ? '' : 's'}
                      </p>
                      <p className="mb-12 max-w-[54ch] text-sm leading-6 text-text-subtle">
                        Each replay keeps your actual recording, the model feedback, and the delivery analytics together so you can review what to tighten on the next run instead of guessing.
                      </p>

                      {hasAnyAverage && (
                        <div className="max-w-[46rem]">
                          <p className="mb-5 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                            Scores, averaged
                          </p>
                          <div className="grid grid-cols-3 gap-x-6 gap-y-7 sm:grid-cols-6">
                            {averageScores.map(({ key, label, value }) => (
                              <div key={key}>
                                <div className="font-display text-[2.25rem] font-medium leading-none tabular-nums text-text">
                                  {value != null ? value.toFixed(1) : '—'}
                                </div>
                                <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-border">
                                  <div
                                    className="h-full bg-accent"
                                    style={{ width: `${((value ?? 0) / 10) * 100}%` }}
                                  />
                                </div>
                                <div className="mt-2 text-[11px] uppercase tracking-eyebrow text-text-muted">
                                  {label}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!isOverviewStep && activeTurn && (
                    <ReplayCoachCard
                      key={`${stepIndex}-${activeTurn.question}`}
                      result={activeTurn}
                      turnNum={stepIndex}
                    />
                  )}
                </section>

                <div className="mt-12 flex flex-wrap items-center gap-3">
                  {stepIndex > 0 && (
                    <FlowHoverButton
                      variant="dark"
                      type="button"
                      onClick={() => goToResultsStep(stepIndex - 1)}
                    >
                      Back
                    </FlowHoverButton>
                  )}

                  {!isLastStep && (
                    <FlowHoverButton
                      type="button"
                      onClick={() => goToResultsStep(stepIndex + 1)}
                    >
                      Review turn {stepIndex + 1}
                    </FlowHoverButton>
                  )}

                  {isLastStep && (
                    <>
                      <FlowHoverButton
                        type="button"
                        onClick={() => navigate('/')}
                      >
                        Start another session
                      </FlowHoverButton>
                      <FlowHoverButton
                        variant="dark"
                        type="button"
                        onClick={() => navigate('/history')}
                      >
                        View history
                      </FlowHoverButton>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </main>

      <ScoreDimensions tagline="One opening question. One follow-up. Then the scores." />
      {transitioning && (
        <PageMorphTransition key={transitionKey} />
      )}
    </div>
  );
}
