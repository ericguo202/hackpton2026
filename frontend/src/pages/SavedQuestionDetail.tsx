/**
 * SavedQuestionDetail — `/saved-question/:id`.
 *
 * The progress view for one saved opening question: a chart of every
 * re-practice attempt + the list of attempts (each linking to its full
 * session). The chart plots two things across attempts:
 *   - Overall score (0-100, rescaled to 0-10 to share the axis), and
 *   - the opening-turn (turn 1) per-dimension scores — the TRUE same-question
 *     comparison, since the follow-up is regenerated each attempt.
 *
 * Failed-eval attempts are shown in the list with a marker but dropped from
 * the chart (never plotted as a 0 point that would dent the trend).
 *
 * Mirrors `History.tsx`'s recharts setup and `SessionDetail.tsx`'s 4xx-redirect
 * handling. All semantic tokens, so dark mode flips for free.
 */

import { useEffect, useMemo, useState } from 'react';
import { UserButton } from '@clerk/react';
import { useNavigate, useParams } from 'react-router';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import RePracticeVoiceDialog from '../components/RePracticeVoiceDialog';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useSavedQuestionDetail } from '../hooks/useSavedQuestionDetail';
import { useSavedQuestions } from '../hooks/useSavedQuestions';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import type {
  SavedQuestionAttempt,
  SavedQuestionDetail as SavedQuestionDetailType,
} from '../types/savedQuestions';
import type { PracticeLocationState } from './Practice';

// Same chart palette + ordering as History.tsx (sourced from --color-chart-*).
const DIMENSIONS = [
  { key: 'structure',       label: 'Structure',       color: 'var(--color-chart-1)' },
  { key: 'problem_solving', label: 'Problem Solving', color: 'var(--color-chart-2)' },
  { key: 'impact',          label: 'Impact',          color: 'var(--color-chart-3)' },
  { key: 'initiative',      label: 'Initiative',      color: 'var(--color-chart-4)' },
  { key: 'depth',           label: 'Depth',           color: 'var(--color-chart-5)' },
  { key: 'delivery',        label: 'Delivery',        color: 'var(--color-chart-6)' },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]['key'];

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: string | number | null | undefined, suffix = ''): string {
  const n = num(v);
  return n === null ? '—' : `${n.toFixed(1)}${suffix}`;
}

type ChartPoint = {
  idx: number;
  label: string;
  sessionId: string;
  created_at: string;
  overall: number | null;
  structure: number | null;
  problem_solving: number | null;
  impact: number | null;
  initiative: number | null;
  depth: number | null;
  delivery: number | null;
};

/**
 * The Overall line is the mean of the SAME turn-1 dimensions plotted below it
 * — NOT the session's blended `overall_score` (which mixes in the follow-up
 * turn, a different question regenerated each attempt). This keeps the whole
 * chart honestly about the opening answer, and makes Overall the visible
 * centroid of the colored lines. Nulls (e.g. delivery when camera was off) are
 * excluded so a missing dimension doesn't drag the average down.
 */
function openingOverall(s: NonNullable<SavedQuestionAttempt['turn1_scores']>): number | null {
  const dims = [s.structure, s.problem_solving, s.impact, s.initiative, s.depth, s.delivery];
  const present = dims.filter((v): v is number => v !== null && v !== undefined);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/** Build chart series from evaluated attempts only (failed ones dropped). */
function buildChartData(attempts: SavedQuestionAttempt[]): ChartPoint[] {
  return attempts
    .filter((a) => !a.evaluation_failed && a.turn1_scores)
    .map((a, i) => {
      const s = a.turn1_scores!;
      return {
        idx: i + 1,
        label: `#${i + 1}`,
        sessionId: a.session_id,
        created_at: a.created_at,
        overall: openingOverall(s),
        structure: s.structure,
        problem_solving: s.problem_solving,
        impact: s.impact,
        initiative: s.initiative,
        depth: s.depth,
        delivery: s.delivery,
      };
    });
}

function ChartTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string; payload: ChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ctx = payload[0].payload;
  const date = new Date(ctx.created_at);
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2 shadow-sm">
      <p className="mb-1 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Attempt #{ctx.idx}
      </p>
      <p className="mb-2 text-xs text-text-subtle">
        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={p.name} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-text-muted">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums text-text">
              {p.value === null ? '—' : p.value.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ToggleChip({ active, onClick, color, label }: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
        (active
          ? 'border-border-strong text-text bg-surface-raised'
          : 'border-border text-text-subtle hover:text-text-muted')
      }
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: active ? color : 'transparent', border: active ? 'none' : `1px solid ${color}` }}
      />
      {label}
    </button>
  );
}

export default function SavedQuestionDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { saved, isLoading, error, errorStatus } = useSavedQuestionDetail(id);
  const { rePractice } = useSavedQuestions();
  const [rePracticing, setRePracticing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [activeDims, setActiveDims] = useState<Record<DimensionKey, boolean>>({
    structure: true,
    problem_solving: true,
    impact: true,
    initiative: true,
    depth: true,
    delivery: true,
  });
  const [showOverall, setShowOverall] = useState(true);

  const chartData = useMemo(
    () => (saved ? buildChartData(saved.attempts) : []),
    [saved],
  );

  // 4xx (not found / not owned) → bounce home with a flash; 5xx stays inline.
  const shouldRedirect =
    errorStatus !== null && errorStatus >= 400 && errorStatus < 500;
  useEffect(() => {
    if (shouldRedirect) {
      navigate('/', {
        replace: true,
        state: { flash: 'That saved question does not exist.' },
      });
    }
  }, [shouldRedirect, navigate]);

  async function handleRePractice(sq: SavedQuestionDetailType, voiceId: string | null) {
    setRePracticing(true);
    try {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        navigate('/', {
          replace: true,
          state: { flash: 'Microphone access is required to practice.' },
        });
        return;
      }
      const data = await rePractice(sq.id, voiceId);
      const state: PracticeLocationState = {
        sessionId: data.session_id,
        firstQuestion: data.first_question,
        firstQuestionAudioUrl: data.first_question_audio_url,
        company: sq.company,
        jobTitle: sq.job_title,
      };
      navigate('/practice', { state });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : (err as Error).message;
      navigate('/', { replace: true, state: { flash: msg } });
    } finally {
      setRePracticing(false);
      setDialogOpen(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink to="/" matchPatterns={['/practice']}>Practice</TopBarNavLink>
            <TopBarNavLink to="/history" matchPatterns={['/sessions/:id', '/saved-question/:id']}>
              History
            </TopBarNavLink>
            <TopBarNavLink to="/personalize">Personalize</TopBarNavLink>
            <TopBarNavLink to="/calibrate">Calibration</TopBarNavLink>
          </>
        }
        rightSlot={<UserButton />}
      />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[80rem] 2xl:max-w-[88rem] px-8 py-12 md:px-16 md:py-16">
          {isLoading && <p className="text-sm text-text-muted">Loading…</p>}

          {error && !isLoading && !shouldRedirect && (
            <p role="alert" className="text-sm text-text-muted">
              <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
              {error}
            </p>
          )}

          {saved && (
            <>
              {/* Header — frozen question + context + re-practice */}
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="anim-reveal mb-6 text-eyebrow uppercase tracking-eyebrow text-text-muted hover:text-text cursor-pointer"
              >
                ← Saved questions
              </button>
              <div className="anim-reveal mb-10 flex flex-col gap-6 md:mb-12 md:flex-row md:items-end md:justify-between">
                <div className="max-w-[54rem]">
                  <h1
                    className="font-display font-medium leading-[1.1] tracking-[-0.02em] text-text"
                    style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}
                  >
                    {saved.question_text}
                  </h1>
                  <p className="mt-4 text-sm text-text-muted">
                    {saved.job_title} @ {saved.company} · saved{' '}
                    {new Date(saved.created_at).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>
                <FlowHoverButton
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  disabled={rePracticing}
                >
                  {rePracticing ? 'Starting…' : 'Re-practice'}
                </FlowHoverButton>
              </div>

              <RePracticeVoiceDialog
                open={dialogOpen}
                busy={rePracticing}
                questionText={saved.question_text}
                onCancel={() => setDialogOpen(false)}
                onStart={(voiceId) => void handleRePractice(saved, voiceId)}
              />

              {/* Trend chart */}
              <section className="anim-reveal mb-16" style={{ animationDelay: '120ms' }}>
                <div className="mb-6 flex items-baseline justify-between gap-4">
                  <h2
                    className="font-display font-medium text-text"
                    style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)' }}
                  >
                    Progress
                  </h2>
                  <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle">
                    0–10 scale · opening answer
                  </p>
                </div>

                <p className="mb-6 text-sm leading-[1.6] text-text-muted">
                  Each point is one re-practice of this opening question, oldest
                  to newest. The dimension lines are how that attempt's opening
                  answer scored on each rubric, and Overall is their average — so
                  the whole chart tracks the same question over time. The
                  regenerated follow-up isn't counted here, and attempts whose
                  evaluation failed are left off the line.
                </p>

                {chartData.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    Re-practice this question to start a trend.
                  </p>
                ) : (
                  <>
                    <div className="mb-6 flex flex-wrap gap-2">
                      <ToggleChip
                        active={showOverall}
                        onClick={() => setShowOverall((v) => !v)}
                        color="var(--color-text)"
                        label="Overall"
                      />
                      {DIMENSIONS.map((d) => (
                        <ToggleChip
                          key={d.key}
                          active={activeDims[d.key]}
                          onClick={() => setActiveDims((prev) => ({ ...prev, [d.key]: !prev[d.key] }))}
                          color={d.color}
                          label={d.label}
                        />
                      ))}
                    </div>

                    <div className="w-full" style={{ height: 320 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            stroke="var(--color-text-subtle)"
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: 'var(--color-border)' }}
                          />
                          <YAxis
                            domain={[0, 10]}
                            ticks={[0, 2, 4, 6, 8, 10]}
                            stroke="var(--color-text-subtle)"
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: 'var(--color-border)' }}
                            width={28}
                          />
                          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border-strong)' }} />
                          {showOverall && (
                            <Line
                              type="monotone"
                              dataKey="overall"
                              name="Overall"
                              stroke="var(--color-text)"
                              strokeWidth={2.5}
                              dot={{ r: 3, fill: 'var(--color-text)' }}
                              activeDot={{ r: 5 }}
                              connectNulls
                              isAnimationActive={false}
                            />
                          )}
                          {DIMENSIONS.map((d) =>
                            activeDims[d.key] ? (
                              <Line
                                key={d.key}
                                type="monotone"
                                dataKey={d.key}
                                name={d.label}
                                stroke={d.color}
                                strokeWidth={1.5}
                                dot={{ r: 2.5, fill: d.color }}
                                activeDot={{ r: 4 }}
                                connectNulls
                                isAnimationActive={false}
                              />
                            ) : null,
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </section>

              {/* Attempts list */}
              <section className="anim-reveal" style={{ animationDelay: '200ms' }}>
                <h2
                  className="mb-2 font-display font-medium text-text"
                  style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)' }}
                >
                  Attempts
                </h2>
                {saved.attempts.length === 0 ? (
                  <p className="mt-4 text-sm text-text-muted">No attempts yet.</p>
                ) : (
                  <div className="mt-2">
                    {saved.attempts.map((a, i) => (
                      <AttemptRow
                        key={a.session_id}
                        attempt={a}
                        ordinal={i + 1}
                        onClick={() => navigate(`/sessions/${a.session_id}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function AttemptRow({
  attempt,
  ordinal,
  onClick,
}: {
  attempt: SavedQuestionAttempt;
  ordinal: number;
  onClick: () => void;
}) {
  const date = new Date(attempt.created_at);
  // A still-finalizing attempt reports `evaluation_failed` only because its
  // scores haven't landed yet — surface that as pending, not a failure.
  const pending =
    attempt.status === 'in_progress' || attempt.status === 'pending';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group grid w-full grid-cols-12 items-baseline gap-4 border-t border-border px-2 -mx-2 py-5 text-left rounded-sm transition-colors hover:bg-surface-raised cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <span className="col-span-1 text-eyebrow uppercase tracking-eyebrow text-text-subtle tabular-nums">
        {String(ordinal).padStart(2, '0')}
      </span>
      <span className="col-span-6 text-sm text-text-muted tabular-nums">
        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
      <span className="col-span-5 text-right text-sm tabular-nums">
        {pending ? (
          <span className="text-text-subtle">Scoring in progress</span>
        ) : attempt.evaluation_failed ? (
          <span className="text-text-subtle">Evaluation failed</span>
        ) : (
          <>
            <span className="font-medium text-text">{fmt(attempt.overall_score)}</span>
            <span className="text-text-subtle">/100</span>
          </>
        )}
      </span>
    </button>
  );
}
