/**
 * History page — completed-session list + trend chart over time.
 *
 * Layout (mirrors the editorial tone established in Hero / Home):
 *   - Eyebrow + display heading
 *   - Lifetime stats strip from /me/stats (sessions, all-time avg per dim)
 *   - Trend chart: overall score per session, oldest → newest, with optional
 *     per-dimension toggles
 *   - Session list, newest first, click to drill into per-session detail
 *
 * Recharts is responsive via `<ResponsiveContainer>`; we set a fixed height
 * to keep the page rhythm consistent across viewport widths.
 */

import { useMemo, useState } from 'react';
import { UserButton } from '@clerk/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useMeStats } from '../hooks/useMeStats';
import { useSessions } from '../hooks/useSessions';
import type {
  DimensionAverages,
  SessionListItem,
} from '../types/history';

type Props = {
  onNavigate: (view: 'home' | 'history' | 'personalize') => void;
  onOpenSession: (id: string) => void;
};

// Chart series colors are sourced from the dedicated --color-chart-*
// palette in index.css, NOT the primary/secondary/etc. ramps. Those
// ramps are intentionally monochromatic warm-earth and render as
// indistinguishable near-black on the chart.
const DIMENSIONS = [
  { key: 'directness',  label: 'Directness',  color: 'var(--color-chart-1)' },
  { key: 'star',        label: 'STAR',        color: 'var(--color-chart-2)' },
  { key: 'specificity', label: 'Specificity', color: 'var(--color-chart-3)' },
  { key: 'impact',      label: 'Impact',      color: 'var(--color-chart-4)' },
  { key: 'conciseness', label: 'Conciseness', color: 'var(--color-chart-5)' },
  { key: 'delivery',    label: 'Delivery',    color: 'var(--color-chart-6)' },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]['key'];

/** Wire-format Decimal-as-string → number, with null passthrough. */
function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Display helper: 1 decimal, em-dash for null. */
function fmt(v: string | null | undefined, suffix = ''): string {
  const n = num(v);
  return n === null ? '—' : `${n.toFixed(1)}${suffix}`;
}

/**
 * Build the chart's data series. Sessions arrive newest-first from the API;
 * the chart wants oldest-first so progress reads left → right.
 */
function buildChartData(sessions: SessionListItem[]) {
  return [...sessions].reverse().map((s, i) => {
    const overall = num(s.overall_score);
    return {
      // Stable x-axis label: session ordinal. Date label shown in tooltip.
      idx: i + 1,
      label: `#${i + 1}`,
      sessionId: s.id,
      company: s.company,
      // Overall is 0-100; per-dim averages are 0-10. Rescale overall to
      // 0-10 here so a single Y axis works for both.
      overall: overall === null ? null : overall / 10,
      directness:  num(s.averages.directness),
      star:        num(s.averages.star),
      specificity: num(s.averages.specificity),
      impact:      num(s.averages.impact),
      conciseness: num(s.averages.conciseness),
      delivery:    num(s.averages.delivery),
      created_at: s.created_at,
    };
  });
}

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
        {label}
      </span>
      <span className="font-display text-2xl md:text-3xl text-text tabular-nums leading-none">
        {value}
      </span>
      {hint && (
        <span className="text-[11px] text-text-subtle">{hint}</span>
      )}
    </div>
  );
}

/** One row in the chart's data array — referenced by the tooltip. */
type ChartPoint = {
  idx: number;
  label: string;
  sessionId: string;
  company: string;
  overall: number | null;
  directness:  number | null;
  star:        number | null;
  specificity: number | null;
  impact:      number | null;
  conciseness: number | null;
  delivery:    number | null;
  created_at: string;
};

function ChartTooltip({ active, payload }: {
  active?: boolean;
  // recharts payload is loosely typed at the lib level; we narrow `payload`
  // to our concrete `ChartPoint` here.
  payload?: Array<{ name: string; value: number | null; color: string; payload: ChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ctx = payload[0].payload;
  const date = new Date(ctx.created_at);
  return (
    <div className="rounded-md bg-surface-raised border border-border px-3 py-2 shadow-sm">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-1">
        Session #{ctx.idx} · {ctx.company}
      </p>
      <p className="text-[11px] text-text-subtle mb-2">
        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={p.name} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-text-muted">{p.name}</span>
            <span className="text-text font-medium tabular-nums ml-auto">
              {p.value === null ? '—' : p.value.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionRow({
  session,
  ordinal,
  onClick,
}: {
  session: SessionListItem;
  ordinal: number;
  onClick: () => void;
}) {
  const date = new Date(session.created_at);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left grid grid-cols-12 gap-4 items-baseline py-5 border-t border-border hover:bg-surface-raised transition-colors px-2 -mx-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface cursor-pointer"
    >
      <span className="col-span-1 text-eyebrow uppercase tracking-eyebrow text-text-subtle tabular-nums">
        {String(ordinal).padStart(2, '0')}
      </span>
      <span className="col-span-4 font-display text-base md:text-lg text-text leading-snug truncate">
        {session.company}
      </span>
      <span className="col-span-3 text-sm text-text-muted truncate">
        {session.job_title}
      </span>
      <span className="col-span-2 text-sm text-text-muted tabular-nums">
        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
      <span className="col-span-2 text-right text-sm tabular-nums">
        <span className="text-text font-medium">
          {fmt(session.overall_score)}
        </span>
        <span className="text-text-subtle">/100</span>
      </span>
    </button>
  );
}

export default function History({ onNavigate, onOpenSession }: Props) {
  const { sessions, isLoading: sessionsLoading, error: sessionsError } = useSessions();
  const { stats, isLoading: statsLoading } = useMeStats();

  // Per-dimension toggles. All on by default; clicking the chip toggles
  // individual dimensions so the chart can isolate one at a time.
  const [activeDims, setActiveDims] = useState<Record<DimensionKey, boolean>>({
    directness:  true,
    star:        true,
    specificity: true,
    impact:      true,
    conciseness: true,
    delivery:    true,
  });
  const [showOverall, setShowOverall] = useState(true);

  const chartData = useMemo(
    () => (sessions ? buildChartData(sessions) : []),
    [sessions],
  );

  const hasSessions = (sessions?.length ?? 0) > 0;
  const enoughForChart = chartData.length >= 1;

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink active={false} onClick={() => onNavigate('home')}>
              Practice
            </TopBarNavLink>
            <TopBarNavLink active onClick={() => onNavigate('history')}>
              History
            </TopBarNavLink>
            <TopBarNavLink
              active={false}
              onClick={() => onNavigate('personalize')}
            >
              Personalize
            </TopBarNavLink>
          </>
        }
        rightSlot={<UserButton />}
      />

      <main className="flex-1">
        <div className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-12 md:py-16">

          {/* Eyebrow + heading */}
          <p
            className="anim-reveal text-eyebrow uppercase tracking-eyebrow text-text-muted mb-6"
            style={{ animationDelay: '0ms' }}
          >
            Your history
          </p>
          <h1
            className="anim-reveal font-display font-medium tracking-[-0.02em] leading-[1.05] text-text mb-12 md:mb-16"
            style={{ animationDelay: '80ms', fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
          >
            Progress over time.
          </h1>

          {/* Lifetime stats strip */}
          <section
            className="anim-reveal grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 pb-10 mb-10 border-b border-border"
            style={{ animationDelay: '160ms' }}
          >
            <StatCell
              label="Sessions"
              value={
                statsLoading ? '—'
                  : String(stats?.completed_sessions ?? 0)
              }
              hint={
                stats && stats.total_sessions !== stats.completed_sessions
                  ? `${stats.total_sessions - stats.completed_sessions} in progress`
                  : undefined
              }
            />
            <StatCell
              label="Overall avg"
              value={statsLoading ? '—' : fmt(stats?.average_overall_score ?? null, '/100')}
            />
            <StatCell
              label="Turns evaluated"
              value={statsLoading ? '—' : String(stats?.total_turns_evaluated ?? 0)}
            />
            <StatCell
              label="Filler words"
              value={statsLoading ? '—' : String(stats?.total_filler_word_count ?? 0)}
              hint="lifetime total"
            />
          </section>

          {/* Trend chart */}
          <section
            className="anim-reveal mb-16"
            style={{ animationDelay: '240ms' }}
          >
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <h2
                className="font-display font-medium text-text"
                style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)' }}
              >
                Score trend
              </h2>
              <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle">
                0–10 scale
              </p>
            </div>

            {sessionsError && (
              <p role="alert" className="text-sm text-text-muted mb-4">
                <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
                {sessionsError}
              </p>
            )}

            {sessionsLoading && (
              <p className="text-sm text-text-muted">Loading your sessions…</p>
            )}

            {!sessionsLoading && !enoughForChart && (
              <p className="text-sm text-text-muted">
                Finish your first session to see a trend here.
              </p>
            )}

            {enoughForChart && (
              <>
                {/* Dimension toggles. The "Overall" chip shows the per-session
                    overall score (0-100, rescaled to 0-10 in the chart series). */}
                <div className="flex flex-wrap gap-2 mb-6">
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
                      onClick={() =>
                        setActiveDims((prev) => ({ ...prev, [d.key]: !prev[d.key] }))
                      }
                      color={d.color}
                      label={d.label}
                    />
                  ))}
                </div>

                <div className="w-full" style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
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

          {/* Session list */}
          <section className="anim-reveal" style={{ animationDelay: '320ms' }}>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2
                className="font-display font-medium text-text"
                style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)' }}
              >
                Sessions
              </h2>
              <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle tabular-nums">
                {hasSessions ? `${sessions!.length} total` : ''}
              </p>
            </div>

            {!sessionsLoading && !hasSessions && !sessionsError && (
              <div className="mt-8 py-16 text-center">
                <p className="font-display text-xl text-text mb-2">
                  No completed sessions yet.
                </p>
                <p className="text-sm text-text-muted mb-6">
                  Start a mock interview from Practice to see it here.
                </p>
                <FlowHoverButton
                  type="button"
                  onClick={() => onNavigate('home')}
                >
                  Start a session
                </FlowHoverButton>
              </div>
            )}

            {hasSessions && (
              <div className="mt-2">
                {sessions!.map((s, i) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    ordinal={sessions!.length - i}
                    onClick={() => onOpenSession(s.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  color,
  label,
}: {
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
        'cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
        (active
          ? 'border-border-strong text-text bg-surface-raised'
          : 'border-border text-text-subtle hover:text-text-muted')
      }
    >
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full"
        style={{
          background: active ? color : 'transparent',
          border: active ? 'none' : `1px solid ${color}`,
        }}
      />
      {label}
    </button>
  );
}

// Re-export so the page module is the single import surface.
export type { DimensionAverages };
