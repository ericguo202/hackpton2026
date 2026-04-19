/**
 * Signed-in home - orchestrates the full 2-turn interview session.
 *
 * Phase 1 (setup):   company input form -> POST /sessions
 * Phase 2 (interview): Q audio plays -> auto-record on ended -> stop -> submit -> repeat
 * Phase 3 (done):    all scores from both turns revealed together, with replay coach overlays
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { UserButton, useUser } from '@clerk/react';

import { CameraPreview } from '../components/CameraPreview';
import QuestionPlayer from '../components/QuestionPlayer';
import ScoreDimensions from '../components/ScoreDimensions';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { useApi } from '../hooks/useApi';
import { useFaceAnalyzer, type AnalyzerDiagnostics } from '../hooks/useFaceAnalyzer';
import { useMe } from '../hooks/useMe';
import { useRecorder } from '../hooks/useRecorder';
import { ApiError } from '../lib/api';
import { getReplayFaceLandmarker } from '../lib/faceLandmarker';
import type { InterviewSummary } from '../lib/faceHeuristics';
import type { Scores, TurnResult } from '../types/session';

type SessionStart = {
  session_id: string;
  summary: { description: string; headlines: string[]; values: string[] };
  first_question: string;
  first_question_audio_url: string;
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

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-[3px] w-24 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="w-8 text-xs tabular-nums text-text-muted">{value}/10</span>
    </div>
  );
}

function getScoreEntries(scores: Scores) {
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
      detail: `${result.filler_word_count} filler words showed up in this turn. Slow the first sentence down to create cleaner pauses.`,
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

  insights.push({
    title: 'Model note',
    detail: result.feedback,
  });

  return insights.slice(0, 4);
}

function turnAverage(result: TurnResult): number {
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

function ReplayCoachCard({ result, turnNum }: { result: ReplayTurnResult; turnNum: number }) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const insights = buildReplayInsights(result);
  const scoreEntries = getScoreEntries(result.scores);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <div className="mt-10 max-w-[70rem] border-t border-border pt-10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Turn {turnNum}
          </p>
          <h3 className="mb-2 max-w-[40rem] text-xl">{result.question}</h3>
          <p className="text-sm text-text-muted">
            Overall {computeOverall(result)}/10
            {result.scores.delivery != null ? `, delivery ${result.scores.delivery}/10` : ', delivery unavailable'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowOverlay((value) => !value)}
          className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          {showOverlay ? 'Hide coach overlay' : 'Show coach overlay'}
        </button>
        {result.replayUrl && (
          <button
            type="button"
            onClick={() => setShowLandmarks((value) => !value)}
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            {showLandmarks ? 'Hide AI face landmarks' : 'Show AI face landmarks'}
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.9fr)]">
        <div>
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
                      {result.feedback}
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

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {scoreEntries.map((entry) => (
              <div key={entry.key} className="rounded-xl bg-surface-raised p-4">
                <div className="mb-2 text-sm text-text-muted">{entry.label}</div>
                <ScoreBar value={entry.value} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-surface-raised p-5">
            <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
              Improve next
            </p>
            <div className="space-y-3">
              {insights.map((insight) => (
                <div key={insight.title} className="rounded-xl border border-border/70 bg-surface p-4">
                  <p className="mb-1 text-sm font-medium text-text">{insight.title}</p>
                  <p className="text-sm leading-6 text-text-muted">{insight.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-surface-raised p-5">
            <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
              Capture diagnostics
            </p>
            <div className="space-y-2 text-sm text-text-muted">
              <p>Analyzer status: {getAnalyzerStatusLabel(result.analyzerDiagnostics.status)}</p>
              <p>Frames processed: {result.analyzerDiagnostics.framesProcessed}</p>
              <p>Face frames: {result.analyzerDiagnostics.faceFrames}</p>
              {result.cvSummary && (
                <>
                  <p>Face visible: {result.cvSummary.face_visible_pct}%</p>
                  <p>Eye contact: {result.cvSummary.eye_contact_score}/100</p>
                  <p>Expression: {result.cvSummary.expression_score}/100</p>
                  <p>Delivery hint: {result.cvSummary.coaching_tip}</p>
                </>
              )}
              {result.analyzerDiagnostics.initError && (
                <p className="text-red-600">Analyzer error: {result.analyzerDiagnostics.initError}</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-surface-raised p-5">
            <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
              Transcript
            </p>
            <p className="text-sm leading-7 text-text-muted">{result.transcript}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function revokeReplayUrls(turns: ReplayTurnResult[]) {
  for (const turn of turns) {
    if (turn.replayUrl) URL.revokeObjectURL(turn.replayUrl);
    if (turn.audioReplayUrl) URL.revokeObjectURL(turn.audioReplayUrl);
  }
}

type Props = {
  /** Switch to the History view via the TopBar nav link. */
  onNavigateHistory: () => void;
};

export default function Home({ onNavigateHistory }: Props) {
  const { user } = useUser();
  const { me } = useMe();
  const { apiFetch } = useApi();
  const recorder = useRecorder();
  const analyzer = useFaceAnalyzer(
    recorder.videoStream,
    recorder.state === 'recording',
  );
  const turnResultsRef = useRef<ReplayTurnResult[]>([]);

  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState<CurrentQ | null>(null);
  const [turnResults, setTurnResults] = useState<ReplayTurnResult[]>([]);
  const [submittingTurn, setSubmittingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const firstName = user?.firstName ?? null;

  useEffect(() => {
    turnResultsRef.current = turnResults;
  }, [turnResults]);

  useEffect(() => {
    return () => {
      revokeReplayUrls(turnResultsRef.current);
    };
  }, []);

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
        }),
      });
      setSessionId(data.session_id);
      setCurrentQ({ text: data.first_question, audioUrl: data.first_question_audio_url, num: 1 });
    } catch (err) {
      setSetupError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitTurn() {
    if (!recorder.audioBlob || !sessionId || !currentQ) return;
    setSubmittingTurn(true);
    setTurnError(null);
    try {
      const form = new FormData();
      form.append('audio', recorder.audioBlob, 'answer.webm');

      const cvSummary = analyzer.buildSummary();
      if (cvSummary) {
        form.append('cv_summary', JSON.stringify(cvSummary));
      } else {
        console.warn('[Home] cv_summary missing on submit', analyzer.diagnostics);
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

      console.groupCollapsed(`[Home] submit turn ${currentQ.num}`);
      console.log('[Home] current question', currentQ.text);
      console.log('[Home] recorder state before submit', {
        hasAudioBlob: Boolean(recorder.audioBlob),
        audioBlobSize: recorder.audioBlob?.size ?? 0,
        audioBlobType: recorder.audioBlob?.type ?? null,
        hasReplayBlob: Boolean(recorder.replayBlob),
        replayBlobSize: recorder.replayBlob?.size ?? 0,
        replayBlobType: recorder.replayBlob?.type ?? null,
      });
      console.log('[Home] analyzer diagnostics before submit', analyzer.diagnostics);
      console.log('[Home] cvSummary before submit', cvSummary);
      console.log('[Home] FormData entries', formEntries);

      const result = await apiFetch<TurnResult>(
        `/api/v1/sessions/${sessionId}/turns`,
        { method: 'POST', body: form },
      );

      console.log('[Home] API result', result);
      console.log('[Home] delivery returned', {
        delivery: result.scores.delivery,
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

      console.log('[Home] enriched replay turn result', {
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
        setIsDone(true);
        setCurrentQ(null);
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
      console.error('[Home] submit turn failed', {
        question: currentQ.text,
        analyzerDiagnostics: analyzer.diagnostics,
        error: err,
      });
      console.groupEnd();
      setTurnError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setSubmittingTurn(false);
    }
  }

  function handleNewSession() {
    revokeReplayUrls(turnResultsRef.current);
    turnResultsRef.current = [];
    setSessionId(null);
    setCurrentQ(null);
    setTurnResults([]);
    setIsDone(false);
    setTurnError(null);
    setSetupError(null);
    recorder.reset();
    analyzer.reset();
    setCompany('');
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink active onClick={() => undefined}>
              Practice
            </TopBarNavLink>
            <TopBarNavLink active={false} onClick={onNavigateHistory}>
              History
            </TopBarNavLink>
          </>
        }
        rightSlot={<UserButton />}
      />

      <main className="flex-1">
        {!sessionId && (
          <form
            onSubmit={handleStart}
            className="mx-auto w-full max-w-[80rem] px-8 py-16 md:px-16 md:py-24"
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

              <div
                className="anim-reveal mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-4"
                style={{ animationDelay: '240ms' }}
              >
                <button
                  type="submit"
                  disabled={!company.trim() || submitting}
                  className="group inline-flex items-baseline gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? 'Starting...' : 'Begin session'}
                  <span
                    aria-hidden
                    className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
                  >
                    {'->'}
                  </span>
                </button>

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
        )}

        {sessionId && !isDone && currentQ && (
          <div className="mx-auto w-full max-w-[80rem] px-8 py-16 md:px-16">
            <div className="max-w-[70rem]">
              <QuestionPlayer
                question={currentQ.text}
                audioUrl={currentQ.audioUrl}
                questionNum={currentQ.num}
                onEnded={() => {
                  recorder.start().catch((err: Error) => {
                    setTurnError(`Could not start recording: ${err.message}`);
                  });
                }}
              />

              {recorder.videoStream && (
                <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
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

                {submittingTurn ? (
                  <p className="text-sm text-text-muted">Analyzing your response - usually takes 5-10 seconds.</p>
                ) : (
                  <>
                    {recorder.state === 'idle' && (
                      <p className="text-sm text-text-subtle">
                        Recording will start automatically when the question finishes.
                      </p>
                    )}

                    {recorder.state === 'recording' && (
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-2 text-sm text-text">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          Recording
                        </span>
                        <button
                          onClick={recorder.stop}
                          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-[14px] text-text transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
                        >
                          Stop recording
                        </button>
                      </div>
                    )}

                    {recorder.state === 'stopped' && recorder.audioUrl && (
                      <div className="space-y-4">
                        {recorder.replayUrl ? (
                          <div className="aspect-video overflow-hidden rounded-2xl bg-surface-sunken">
                            <video src={recorder.replayUrl} controls className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <audio src={recorder.audioUrl} controls className="w-full" />
                        )}
                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={handleSubmitTurn}
                            className="group inline-flex items-baseline gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
                          >
                            Submit answer
                            <span aria-hidden className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">{'->'}</span>
                          </button>
                          <button
                            onClick={recorder.reset}
                            className="inline-flex items-center rounded-full border border-border px-5 py-2.5 text-[14px] text-text-muted transition-colors hover:border-border-strong hover:text-text"
                          >
                            Re-record
                          </button>
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
                  <p role="alert" className="text-sm text-text-muted">
                    <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
                    {turnError}
                  </p>
                )}
              </div>

              {turnResults.length > 0 && (
                <div className="mt-8 rounded-lg bg-surface-raised p-4">
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

        {isDone && (
          <div className="mx-auto w-full max-w-[80rem] px-8 py-16 md:px-16">
            <div className="max-w-[72rem]">
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
              <p className="max-w-[54ch] text-sm leading-6 text-text-subtle">
                Each replay keeps your actual recording, the model feedback, and the delivery analytics together so you can review what to tighten on the next run instead of guessing.
              </p>

              {turnResults.map((r, i) => (
                <ReplayCoachCard key={`${i}-${r.question}`} result={r} turnNum={i + 1} />
              ))}

              <div className="mt-12 flex flex-wrap gap-3">
                <button
                  onClick={handleNewSession}
                  className="group inline-flex items-baseline gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
                >
                  Start another session
                  <span aria-hidden className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">→</span>
                </button>
                <button
                  onClick={onNavigateHistory}
                  className="group inline-flex items-baseline gap-2 rounded-full border border-border px-7 py-3.5 text-[15px] text-text transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
                >
                  View history
                  <span aria-hidden className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">→</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <ScoreDimensions tagline="One opening question. One follow-up. Then the scores." />
    </div>
  );
}
