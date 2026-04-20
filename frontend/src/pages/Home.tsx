/**
 * Signed-in home - orchestrates the full 2-turn interview session.
 *
 * Phase 1 (setup):   company input form -> POST /sessions
 * Phase 2 (interview): Q audio plays -> auto-record on ended -> stop -> submit -> repeat
 * Phase 3 (done):    all scores from both turns revealed together, with replay coach overlays
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { UserButton, useUser } from '@clerk/react';
import { ImageDithering } from '@paper-design/shaders-react';
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
import { useMe } from '../hooks/useMe';
import { useMorphTransition } from '../hooks/useMorphTransition';
import { useRecorder } from '../hooks/useRecorder';
import { ApiError } from '../lib/api';
import { fillerBreakdown, tokenizeTranscript } from '../lib/fillerWords';
import { getReplayFaceLandmarker } from '../lib/faceLandmarker';
import type { InterviewSummary } from '../lib/faceHeuristics';
import { VOICE_PROFILES, type VoiceProfile } from '../lib/voices';
import type { SessionDetail } from '../types/history';
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

/**
 * Pure-CSS ring spinner. Inherits its color via `border-current`, so the
 * caller can tint it by setting `text-*` on a parent. Pure presentation —
 * no layout side effects (the parent controls flow / sizing).
 */
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
  // `scores` is null while the background evaluator is still running on
  // turn 1 — the caller should typically guard against this and skip
  // rendering, but returning [] keeps every consumer safe.
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

/**
 * Returns one row per dimension with the per-turn scores averaged across
 * every turn that produced a value. Missing scores (e.g. turn 1 bg-eval
 * failure, or camera-less `delivery`) are skipped, not zero-weighted —
 * otherwise a failed eval would drag the average down instead of being
 * surfaced as unavailable.
 */
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

  // Defensive: if a final-page render somehow fires before scores have
  // landed (bg eval crashed AND inline-eval fallback also failed),
  // surface that explicitly rather than rendering a blank card.
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

/**
 * Small horizontal bar chart of filler-word counts for a single turn.
 *
 * Rendered next to the expanded transcript so the candidate can see
 * which crutch words dominated, not just the total count. Colors are
 * aligned to the red highlight used inline in the transcript — same
 * visual language, same meaning. Chart dimensions are intentionally
 * compact: the transcript prose is the primary element; this is a
 * secondary readout that complements it.
 *
 * Empty-state: if the transcript has zero detected fillers we still
 * render a short line of text so the right column doesn't look broken
 * or abandoned.
 */
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

  // One bar per detected filler, ~28px per row plus padding for the
  // axis + title. Clamped so a runaway answer with every filler in the
  // list doesn't blow out the column.
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
              // recharts v3 types the incoming value as
              // `ValueType | undefined` (number | string | array | undefined).
              // Coerce defensively — our data is always numeric, but typing
              // it as `number` here makes TS reject the Formatter signature.
              formatter={(value) => [`${value ?? 0}×`, 'Count']}
            />
            <Bar
              dataKey="count"
              // red-500 at 60% matches the transcript highlight family
              // (bg-red-500/30 on text) while being more saturated so
              // the bars read clearly against the cream surface.
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
        {/* Left column: replay media + score strip */}
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
              {/* Toggles pinned to the video so they don't compete with the question heading. */}
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

        {/* Right column: coach prose + insights */}
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

      {/*
        Transcript lives outside the 2-column grid so it spans the full card
        width (72rem) instead of being clamped to either column. Long answers
        otherwise force vertical scrolling inside a narrow rail; full-width
        prose with a sane reading max-width keeps everything above the fold.
      */}
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
            // Two-column reveal: transcript on the left (capped at a
            // readable measure), filler-word distribution chart on the
            // right. Right column is narrower and capped at ~18rem so
            // the chart stays visually "secondary" to the transcript.
            <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
              <p className="max-w-[72ch] text-sm leading-7 text-text-muted">
                {tokenizeTranscript(result.transcript).map((tok, i) =>
                  tok.kind === 'filler' ? (
                    // Filler highlight: medium-opacity red wash with a slightly
                    // stronger red text tone so the word still reads cleanly.
                    // Match list lives in src/lib/fillerWords.ts and mirrors
                    // the backend regex in app/services/filler_words.py.
                    <span
                      key={i}
                      className="rounded-sm bg-red-500/30 px-1 text-red-900 decoration-red-700/50 underline-offset-2"
                      title={`Filler word: "${tok.canonical}"`}
                    >
                      {tok.text}
                    </span>
                  ) : (
                    // Plain text fragments are rendered as a Fragment so
                    // whitespace and newlines inside the transcript are
                    // preserved verbatim — wrapping them in a <span> would
                    // collapse no visible characters but adds DOM noise.
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

/**
 * Disclosure-style voice picker for the start form.
 *
 * Collapsed by default — the form's primary affordance is "type the
 * company and hit Begin." Most candidates will skip the picker and
 * accept the auto-randomized voice, which the backend resolves
 * server-side from the session UUID. Clicking the disclosure expands
 * a wrap of selectable pills (name + accent label, no audio preview).
 *
 * Selection state lives in the parent so the chosen `voice_id` ships
 * in the `POST /sessions` body. `selectedId === null` means "let the
 * backend pick" — the pill row visually highlights nothing in that
 * case and the helper line reads "Surprise me."
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
        {/*
          Auto-submit toggle lives next to the voice picker so both session
          preferences are collected in one visual row. Pill style mirrors
          the voice pills below for consistency. Default is OFF (per user
          ask); pref is persisted via `useLocalStoragePref` on the parent.
        */}
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
            {/*
              Explicit "Surprise me" pill so the candidate can BACK OUT
              of a pick without reloading the page. Maps to selectedId
              = null which the backend treats as "use the deterministic
              fallback derived from the session UUID."
            */}
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

function revokeReplayUrls(turns: ReplayTurnResult[]) {
  for (const turn of turns) {
    if (turn.replayUrl) URL.revokeObjectURL(turn.replayUrl);
    if (turn.audioReplayUrl) URL.revokeObjectURL(turn.audioReplayUrl);
  }
}

/**
 * Overlay server-side scores/feedback onto local placeholder turns.
 *
 * Turn 1's `POST /turns` response returns null scores because the
 * evaluator runs in the background. After turn 2 finalizes, we refetch
 * the full session and graft the now-evaluated scores onto each
 * placeholder by index — local-only fields (replay blobs, analyzer
 * diagnostics, recorded `cvSummary`) survive untouched because the
 * server doesn't have them.
 */
function mergeServerScores(
  local: ReplayTurnResult[],
  detail: SessionDetail,
): ReplayTurnResult[] {
  return local.map((turn, idx) => {
    const server = detail.turns[idx];
    // The server is the source of truth for ordering (it returns turns
    // sorted by turn_number), so an index mismatch means something
    // weird happened — better to keep the local placeholder than to
    // wipe its replay blobs with a wrong-turn graft.
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
  // Morph overlay for phase changes (setup -> interview -> done).
  // In-phase state swaps (recorder idle/recording/stopped/submitting)
  // use the lighter `anim-crossfade` class instead, since a full-screen
  // morph would be disruptive for sub-second UI updates.
  const { trigger: triggerMorph, transitioning, transitionKey } = useMorphTransition();
  // Direction of the active morph. Setup -> interview sweeps right-to-left
  // (feels like stepping forward into the session); interview -> done
  // keeps the default bottom-to-top sweep. Set before `triggerMorph` so
  // React batches both state updates into the render that mounts the
  // overlay with the correct direction.
  const [morphDirection, setMorphDirection] = useState<'up' | 'left'>('up');
  const turnResultsRef = useRef<ReplayTurnResult[]>([]);

  const [company, setCompany] = useState('');
  // null = "Surprise me" (let the backend pick from the session UUID).
  // Otherwise, an explicit voice ID from `VOICE_PROFILES`. Reset to
  // null on `handleNewSession` so each session starts fresh — matches
  // the per-session scope the user picked when designing this feature.
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [showQuestionText, setShowQuestionText] = useLocalStoragePref('show_question_text', true);
  // Off by default. When on, tapping "End answer" while recording fires the
  // auto-submit effect below and skips the preview/Re-record block entirely.
  // When off, the flow falls back to the legacy review step where the user
  // can replay their recording and choose to Submit or redo the turn.
  const [autoSubmit, setAutoSubmit] = useLocalStoragePref('auto_submit_enabled', false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState<CurrentQ | null>(null);
  const [turnResults, setTurnResults] = useState<ReplayTurnResult[]>([]);
  const [submittingTurn, setSubmittingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  // Stepped summary view. Step 0 is the session overview, steps 1..N map
  // to each turn's ReplayCoachCard. `stepKey` force-remounts the section
  // so the slide animation replays on every navigation, same pattern as
  // `OnboardingForm`. `direction` picks slide-in-left (forward) vs
  // slide-in-right (back).
  const [resultsStep, setResultsStep] = useState(0);
  const [resultsStepKey, setResultsStepKey] = useState(0);
  const [resultsDirection, setResultsDirection] = useState<'forward' | 'back'>('forward');
  // Latched as soon as the user clicks "End answer" so the spinner shows
  // immediately instead of flashing the (now-removed) preview UI for the
  // tens-of-ms it takes MediaRecorder to flush its final chunk and
  // populate `recorder.audioBlob`. The auto-submit effect below clears
  // it implicitly by transitioning into `submittingTurn === true`.
  const [endingTurn, setEndingTurn] = useState(false);
  // Bumped when the user clicks Re-record so the <QuestionPlayer> below
  // remounts, retriggering its native `<audio autoPlay>` — after the
  // replay ends, the existing `onEnded` handler starts the recorder
  // again. Lets us reuse the same question without adding an imperative
  // ref API to QuestionPlayer.
  const [replayKey, setReplayKey] = useState(0);

  const firstName = user?.firstName ?? null;

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
  // submission. We can't chain this synchronously off the Stop click
  // because `audioBlob` lands a beat later (set inside the recorder's
  // `onstop` callback), and we don't want a preview window between them.
  //
  // `submitTurnRef` holds the latest `handleSubmitTurn` closure. It is
  // refreshed via a no-deps effect declared BEFORE the auto-submit effect
  // below. React runs effects in declaration order after each render, so
  // by the time the auto-submit effect reads `submitTurnRef.current`, it
  // already points at this render's closure (which sees the latest
  // `recorder.audioBlob`, `sessionId`, `currentQ`, etc.). That keeps the
  // closure fresh without the write-during-render pattern that the
  // `react-hooks/refs` rule flags.
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
          // Backend treats null/missing as "use the deterministic
          // fallback from session UUID," so we only send a string
          // when the candidate explicitly picked a voice.
          ...(voiceId ? { voice_id: voiceId } : {}),
        }),
      });
      // Phase 1 -> Phase 2: commit the new session state mid-morph so
      // the user sees the question panel only after the overlay covers
      // the screen. The overlay clears ~450ms later on its own.
      setMorphDirection('left');
      triggerMorph(() => {
        setSessionId(data.session_id);
        setCurrentQ({ text: data.first_question, audioUrl: data.first_question_audio_url, num: 1 });
      });
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
    // Clear the "user clicked Stop" latch — once the spinner is up the
    // auto-submit effect must not re-trigger if React batches state.
    setEndingTurn(false);
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
        // `result.scores` is null on non-final turns while the
        // evaluator runs in the background; we surface that explicitly
        // here instead of crashing on a property access.
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
        // Turn 1's response intentionally returned null scores so the
        // candidate could move on while Gemma 4 ran in the background.
        // The backend awaited that bg task before responding to turn 2,
        // so by now both turns are scored in the DB. Pull the full
        // session and overlay the real scores onto our placeholders
        // before flipping to the done view — otherwise turn 1 would
        // render with the "Scores unavailable" fallback.
        try {
          const detail = await apiFetch<SessionDetail>(
            `/api/v1/sessions/${sessionId}`,
          );
          setTurnResults((prev) => mergeServerScores(prev, detail));
        } catch (err) {
          console.warn(
            '[Home] post-finalize session detail refetch failed; '
            + 'turn-1 placeholder will render the "Scores unavailable" '
            + 'fallback.',
            err,
          );
        }
        // Phase 2 -> Phase 3: the session-complete screen lands with
        // the overlay covering the spinner-to-results swap. Default
        // 'up' direction — reserves the right-to-left sweep for the
        // "starting the interview" gesture.
        setMorphDirection('up');
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

  // Re-record: reset the recorder (drops the prior blob + revokes URLs)
  // and bump `replayKey` so the QuestionPlayer below remounts and its
  // `<audio autoPlay>` replays the same question audio from the top.
  // The existing `onEnded` → `recorder.start()` handler then kicks a
  // fresh recording, so the user effectively redoes the same turn.
  function handleReRecord() {
    recorder.reset();
    setReplayKey((k) => k + 1);
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
    setEndingTurn(false);
    recorder.reset();
    analyzer.reset();
    setCompany('');
    setVoiceId(null);
    setResultsStep(0);
    setResultsDirection('forward');
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
        )}

        {sessionId && !isDone && currentQ && (
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
                  // Only auto-start recording when the recorder is fresh.
                  // QuestionPlayer stays mounted during the preview/Submit/
                  // Re-record step, so if the user replays the question
                  // there (state='stopped'), we must NOT kick off a new
                  // take — that would wipe the blob they just recorded.
                  // Valid entry paths both land on 'idle': initial mount
                  // of a turn, and handleReRecord() which calls
                  // recorder.reset() before bumping replayKey.
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

                {/*
                  Three visual states for the answer panel:
                    1. recorder idle, not submitting    → "Recording will start..." hint
                    2. recorder recording               → red dot + "End answer" button
                    3. recorder stopped OR submitting   → spinner (auto-submit is in flight)
                  The preview / Re-record / Submit-answer block was removed:
                  pressing "End answer" now flips `endingTurn` and calls
                  `recorder.stop()`; the auto-submit effect fires once
                  the audio blob is available, which kicks `submittingTurn`
                  on. Until that happens (a tens-of-ms gap) the spinner
                  is shown via the `endingTurn` branch so the UI never
                  flashes a stale state.
                */}
                {(submittingTurn || endingTurn) ? (
                  // Turn 1: STT + Flash + TTS only (~5-10s); Gemma 4 runs
                  // in the background, so the candidate moves on quickly.
                  // Turn 2: Gemma 4 is on the critical path (we await it
                  // so the session aggregate can be computed), which is
                  // why the copy and the wait estimate change.
                  <div
                    role="status"
                    aria-live="polite"
                    className="anim-crossfade flex items-center gap-3 py-4 text-text-muted"
                  >
                    <Spinner size={20} />
                    <p className="text-sm">
                      {currentQ.num >= 2
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
                            // Flip the latch BEFORE stopping so the auto-submit
                            // effect's guard is armed by the time the recorder's
                            // `onstop` populates `audioBlob`. When the pref is
                            // off the latch stays down and the preview block
                            // below renders as in the legacy flow.
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
                          // Thumbnail-sized preview so the Submit / Re-record
                          // buttons stay above the fold. Full-bleed `aspect-video`
                          // at the parent's 70rem max-width pushes them below
                          // the viewport on a 1080p monitor.
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
                  <p role="alert" className="text-sm text-text-muted">
                    <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
                    {turnError}
                  </p>
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
          // One step for the overview, one per turn. With the locked
          // 2-turn plan that's 3 steps, but the math is general.
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
                        onClick={handleNewSession}
                      >
                        Start another session
                      </FlowHoverButton>
                      <FlowHoverButton
                        variant="dark"
                        type="button"
                        onClick={onNavigateHistory}
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
        <PageMorphTransition key={transitionKey} direction={morphDirection} />
      )}
    </div>
  );
}
