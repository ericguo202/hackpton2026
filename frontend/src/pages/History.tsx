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
import AccountButton from '../components/AccountButton';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import DimensionMenu from '../components/DimensionMenu';
import FilterFieldMenu, { type FilterField } from '../components/FilterFieldMenu';
import LocalSuggestionField from '../components/LocalSuggestionField';
import { StrengthsRadarPanel } from '../components/StrengthsRadar';
import RePracticeVoiceDialog from '../components/RePracticeVoiceDialog';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { Button } from '../components/ui/button';
import { useMeStats, type MeStatsFilter } from '../hooks/useMeStats';
import { useSavedQuestions } from '../hooks/useSavedQuestions';
import { useSessions } from '../hooks/useSessions';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { buildRadarData } from '../lib/radarData';
import { SCORE_DIMENSIONS, type ScoreKey } from '../lib/scoreDimensions';
import type { FillerWordStat, SessionListItem } from '../types/history';
import type { SavedQuestionListItem } from '../types/savedQuestions';
import type { PracticeLocationState } from './Practice';

// Chart series key/label/color come from the canonical SCORE_DIMENSIONS
// (colors sourced from the dedicated --color-chart-* palette in index.css, NOT
// the primary/secondary ramps — those are monochromatic warm-earth and render
// as indistinguishable near-black on a chart).
const DIMENSIONS = SCORE_DIMENSIONS;

type DimensionKey = ScoreKey;

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
      structure:       num(s.averages.structure),
      problem_solving: num(s.averages.problem_solving),
      impact:          num(s.averages.impact),
      initiative:      num(s.averages.initiative),
      depth:           num(s.averages.depth),
      delivery:        num(s.averages.delivery),
      // Filler words as a percent of words for this session. Plotted on its
      // own chart (different axis/scale from the 0-10 scores). Null on legacy
      // rows with no cached word total — dropped from the line.
      filler_rate:     num(s.filler_word_rate),
      created_at: s.created_at,
    };
  });
}

function StatCell({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  /** When set, the value renders as an in-page anchor link (e.g. "#sessions"). */
  href?: string;
}) {
  const valueClass =
    'font-display text-2xl md:text-3xl text-text tabular-nums leading-none';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          className={
            valueClass +
            ' w-fit rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 transition-colors hover:decoration-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
          }
        >
          {value}
        </a>
      ) : (
        <span className={valueClass}>{value}</span>
      )}
      {hint && (
        <span className="text-xs text-text-subtle">{hint}</span>
      )}
    </div>
  );
}

/**
 * Top-5 filler words as a horizontal bar chart. Entries arrive already
 * sorted (count-desc) and capped at 5 from the backend, so this just renders
 * — no client-side sort/slice (cf. ImproveNextCard's per-turn chart, which
 * sorts a raw breakdown map). Terracotta `--color-chart-2` is the conventional
 * filler hue and lives in the dark-mode token swap, so dark mode flips for free.
 */
function FillerWordsChart({ entries }: { entries: FillerWordStat[] }) {
  const rowHeight = 28; // page section, not a card — taller rows than ImproveNext
  const height = entries.length * rowHeight + 8;
  return (
    <div aria-label="Most common filler words">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          layout="vertical"
          data={entries}
          margin={{ top: 2, right: 32, bottom: 2, left: 0 }}
          barCategoryGap={6}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="word"
            tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 3, 3, 0]} barSize={14}>
            <LabelList
              dataKey="count"
              position="right"
              fontSize={12}
              fill="var(--color-text-muted)"
              offset={6}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
  structure:       number | null;
  problem_solving: number | null;
  impact:          number | null;
  initiative:      number | null;
  depth:           number | null;
  delivery:        number | null;
  filler_rate:     number | null;
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
      <p className="text-xs text-text-subtle mb-2">
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

/**
 * Filler-rate-over-time tooltip — like `ChartTooltip` but single-series and
 * percent-formatted (the value is a 0-100 rate, not a 0-10 score).
 */
function FillerRateTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number | null; payload: ChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ctx = payload[0].payload;
  const date = new Date(ctx.created_at);
  return (
    <div className="rounded-md bg-surface-raised border border-border px-3 py-2 shadow-sm">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-1">
        Session #{ctx.idx} · {ctx.company}
      </p>
      <p className="text-xs text-text-subtle mb-2">
        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
      <div className="flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: 'var(--color-chart-2)' }}
        />
        <span className="text-text-muted">Filler rate</span>
        <span className="text-text font-medium tabular-nums ml-auto">
          {ctx.filler_rate === null ? '—' : `${ctx.filler_rate.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
}

/**
 * Filler rate (% of words) per session, oldest → newest. Lower is better;
 * unlike raw filler count this normalizes for answer length, so it reads as a
 * genuine improvement signal. Legacy sessions with no cached word total carry
 * a null rate and are skipped (`connectNulls`).
 */
function FillerRateChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="w-full" style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
            domain={[0, 'auto']}
            allowDecimals={false}
            stroke="var(--color-text-subtle)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            width={36}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<FillerRateTooltip />} cursor={{ stroke: 'var(--color-border-strong)' }} />
          <Line
            type="monotone"
            dataKey="filler_rate"
            name="Filler rate"
            stroke="var(--color-chart-2)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--color-chart-2)' }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
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

export default function History() {
  const navigate = useNavigate();
  const { sessions, isLoading: sessionsLoading, error: sessionsError } = useSessions();
  const { stats, isLoading: statsLoading } = useMeStats();

  // Per-dimension toggles. All on by default; clicking the chip toggles
  // individual dimensions so the chart can isolate one at a time.
  const [activeDims, setActiveDims] = useState<Record<DimensionKey, boolean>>({
    structure:       true,
    problem_solving: true,
    impact:          true,
    initiative:      true,
    depth:           true,
    delivery:        true,
  });
  const [showOverall, setShowOverall] = useState(true);

  // Per-chart time window (default: 10 most recent). `effectiveRange` reconciles
  // this against the actual session count at render time, so no async init.
  const [scoreRange, setScoreRange] = useState<RangeWindow>(10);
  const [fillerRange, setFillerRange] = useState<RangeWindow>(10);

  // Company / Role filter. `filterField` picks the dimension; `filterValue` +
  // `filterSelected` come from the autocomplete — a filter is only "active"
  // once a concrete option is picked, so free-typed text never filters.
  const [filterField, setFilterField] = useState<FilterField>('none');
  const [filterValue, setFilterValue] = useState('');
  const [filterSelected, setFilterSelected] = useState(false);

  const activeFilter = useMemo<MeStatsFilter | null>(
    () =>
      filterField !== 'none' && filterSelected && filterValue
        ? { field: filterField, value: filterValue }
        : null,
    [filterField, filterSelected, filterValue],
  );

  // Autocomplete option universe — the distinct companies / roles across the
  // user's sessions (sorted). Built from the full unfiltered list so the
  // options stay complete regardless of the active filter.
  const companyOptions = useMemo(
    () =>
      sessions
        ? [...new Set(sessions.map((s) => s.company).filter(Boolean))].sort()
        : [],
    [sessions],
  );
  const roleOptions = useMemo(
    () =>
      sessions
        ? [...new Set(sessions.map((s) => s.job_title).filter(Boolean))].sort()
        : [],
    [sessions],
  );

  // Client-side filtered session list (case-insensitive equality). Everything
  // derived from sessions — the charts, radar, and the list — reads this.
  const filteredSessions = useMemo(() => {
    if (!sessions) return null;
    if (!activeFilter) return sessions;
    const needle = activeFilter.value.toLowerCase();
    return sessions.filter(
      (s) =>
        (activeFilter.field === 'company' ? s.company : s.job_title).toLowerCase() ===
        needle,
    );
  }, [sessions, activeFilter]);

  // The summary tiles + "Most used filler words" bar are aggregated
  // server-side. When a filter is active we fetch a filtered /me/stats (same
  // query, one extra WHERE) and show that; otherwise the all-time stats.
  const { stats: filteredStats, isLoading: filteredStatsLoading } = useMeStats(
    activeFilter ?? undefined,
  );
  const displayStats = activeFilter ? filteredStats : stats;
  const displayStatsLoading = activeFilter ? filteredStatsLoading : statsLoading;

  const chartData = useMemo(
    () => (filteredSessions ? buildChartData(filteredSessions) : []),
    [filteredSessions],
  );

  const scoreData = useMemo(
    () => applyRange(chartData, effectiveRange(scoreRange, chartData.length)),
    [chartData, scoreRange],
  );
  const fillerData = useMemo(
    () => applyRange(chartData, effectiveRange(fillerRange, chartData.length)),
    [chartData, fillerRange],
  );

  // Strengths radar: six dims averaged over the up-to-5 most recent sessions.
  // Independent of the line chart's RangeSelector — always its own fixed window.
  // `chartData` is oldest→newest, so the last ≤5 rows are the most recent.
  const radar = useMemo(
    () => (filteredSessions ? buildRadarData(chartData.slice(-5)) : null),
    [filteredSessions, chartData],
  );

  const hasAnySessions = (sessions?.length ?? 0) > 0;
  const filteredCount = filteredSessions?.length ?? 0;
  const hasFilteredSessions = filteredCount > 0;
  const enoughForChart = chartData.length >= 1;
  // Filler-rate trend only renders once at least one session carries a
  // non-null rate (legacy rows without a cached word total are skipped).
  const hasFillerRate = chartData.some((d) => d.filler_rate !== null);
  const hasTopFillerWords = (displayStats?.top_filler_words?.length ?? 0) > 0;

  function handleFilterFieldChange(next: FilterField) {
    setFilterField(next);
    setFilterValue('');
    setFilterSelected(false);
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
            <TopBarNavLink to="/calibrate">
              Calibration
            </TopBarNavLink>
          </>
        }
        rightSlot={<AccountButton />}
      />

      <main className="flex-1">
        <div className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-8 md:px-16 py-12 md:py-16">

          {/* Eyebrow + heading */}
          <p
            className="anim-reveal text-eyebrow uppercase tracking-eyebrow text-text-muted mb-6"
            style={{ animationDelay: '0ms' }}
          >
            Your history
          </p>
          <h1
            className="anim-reveal font-display font-semibold tracking-[-0.02em] leading-[1.05] text-text mb-12 md:mb-16"
            style={{ animationDelay: '80ms', fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
          >
            Progress over time.
          </h1>

          {/* Summary stats strip — all-time, or narrowed when a filter is active. */}
          <section
            className="anim-reveal grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 pb-10 mb-10 border-b border-border"
            style={{ animationDelay: '160ms' }}
          >
            <StatCell
              label="Sessions"
              value={
                displayStatsLoading ? '—'
                  : String(displayStats?.completed_sessions ?? 0)
              }
              href="#sessions"
            />
            <StatCell
              label="Overall avg"
              value={displayStatsLoading ? '—' : fmt(displayStats?.average_overall_score ?? null, '/100')}
            />
            <StatCell
              label="Turns evaluated"
              value={displayStatsLoading ? '—' : String(displayStats?.total_turns_evaluated ?? 0)}
            />
            <StatCell
              label="Filler rate"
              value={displayStatsLoading ? '—' : fmt(displayStats?.filler_word_rate ?? null, '%')}
              hint={
                displayStatsLoading
                  ? undefined
                  : `${displayStats?.total_filler_word_count ?? 0} filler words`
              }
              href="#filler-words"
            />
          </section>

          {/* Company / Role filter — governs everything below (charts, radar,
              filler words, saved questions, and the session list). Shown once
              the user has at least one session. */}
          {hasAnySessions && (
            <section
              className="anim-reveal relative z-30 mb-10"
              style={{ animationDelay: '200ms' }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <FilterFieldMenu
                  value={filterField}
                  onChange={handleFilterFieldChange}
                />
                {filterField !== 'none' && (
                  <div className="flex-1 min-w-[12rem] max-w-[24rem]">
                    <LocalSuggestionField
                      options={filterField === 'company' ? companyOptions : roleOptions}
                      value={filterValue}
                      onChange={(v) => {
                        setFilterValue(v);
                        setFilterSelected(false);
                      }}
                      selected={filterSelected}
                      onSelectedChange={setFilterSelected}
                      inputClassName="w-full rounded-full border border-border-strong bg-surface-raised px-4 py-1.5 text-sm text-text placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      placeholder={
                        filterField === 'company'
                          ? 'Type a company…'
                          : 'Type a role…'
                      }
                      ariaLabel={
                        filterField === 'company'
                          ? 'Filter by company'
                          : 'Filter by role'
                      }
                    />
                  </div>
                )}
              </div>
              {activeFilter && (
                <p className="mt-3 text-xs text-text-subtle">
                  Showing {activeFilter.field === 'company' ? 'company' : 'role'}{' '}
                  <span className="text-text-muted">“{activeFilter.value}”</span> ·{' '}
                  {filteredCount} session{filteredCount === 1 ? '' : 's'}
                  <button
                    type="button"
                    onClick={() => handleFilterFieldChange('none')}
                    className="ml-2 text-link underline-offset-2 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
                  >
                    Clear
                  </button>
                </p>
              )}
            </section>
          )}

          {/* Trend chart */}
          <section
            className="anim-reveal mb-6"
            style={{ animationDelay: '240ms' }}
          >
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <h2
                className="font-display font-semibold text-text"
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
                {activeFilter
                  ? 'No sessions match this filter.'
                  : 'Finish your first session to see a trend here.'}
              </p>
            )}

            {enoughForChart && (
              <div className="grid grid-cols-1 min-[900px]:grid-cols-3 gap-8 min-[900px]:gap-10">
                {/* Line chart (2/3): over-time progression, one line per dim. */}
                <div className="min-[900px]:col-span-2">
                {/* Dimension toggles (left) + time-window selector (right). The
                    `DimensionMenu` dropdown is used at ALL widths — the inline
                    pill row was retired because seven pills wrapped into a tall,
                    overlapping block in the 2/3 column. "Overall" toggles the
                    per-session overall score (0-100, rescaled to 0-10). */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                  <DimensionMenu
                    showOverall={showOverall}
                    onToggleOverall={() => setShowOverall((v) => !v)}
                    dimensions={DIMENSIONS}
                    activeDims={activeDims}
                    onToggleDim={(key) =>
                      setActiveDims((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                  />
                  <RangeSelector
                    total={chartData.length}
                    value={scoreRange}
                    onChange={setScoreRange}
                  />
                </div>

                <div className="w-full" style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={scoreData}
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
                </div>

                {/* Radar (1/3): six dims averaged over the last ≤5 sessions —
                    the shape reads as consistent strengths/weaknesses. */}
                <div className="min-[900px]:col-span-1">
                  <StrengthsRadarPanel radar={radar} unitLabel="session" />
                </div>
              </div>
            )}
          </section>

          {/* Filler words — rate-over-time + most-common side by side on
              desktop, stacked full-width below 900px. Each chart self-gates,
              so the section appears once either has data. */}
          {(hasFillerRate || hasTopFillerWords) && (
            <section id="filler-words" className="anim-reveal mb-10" style={{ animationDelay: '270ms' }}>
              <h2
                className="font-display font-semibold text-text mb-6"
                style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)' }}
              >
                Filler words
              </h2>
              <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-8 min-[900px]:gap-10">
                {hasFillerRate && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle">
                        Rate over time · % of words
                      </p>
                      <RangeSelector
                        total={chartData.length}
                        value={fillerRange}
                        onChange={setFillerRange}
                      />
                    </div>
                    <FillerRateChart data={fillerData} />
                  </div>
                )}
                {hasTopFillerWords && (
                  <div>
                    <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle mb-4">
                      Most used
                    </p>
                    <FillerWordsChart entries={displayStats!.top_filler_words} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Saved questions — hidden entirely when the user has none (or none
              match the active filter). */}
          <SavedQuestionsSection activeFilter={activeFilter} />

          {/* Session list */}
          <section id="sessions" className="anim-reveal scroll-mt-8" style={{ animationDelay: '320ms' }}>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2
                className="font-display font-semibold text-text"
                style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)' }}
              >
                Sessions
              </h2>
              <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle tabular-nums">
                {hasFilteredSessions ? `${filteredCount} total` : ''}
              </p>
            </div>

            {!sessionsLoading && !hasAnySessions && !sessionsError && (
              <div className="mt-8 py-16 text-center">
                <p className="font-display text-xl text-text mb-2">
                  No completed sessions yet.
                </p>
                <p className="text-sm text-text-muted mb-6">
                  Start a mock interview from Practice to see it here.
                </p>
                <Button
                  type="button"
                  onClick={() => navigate('/')}
                >
                  Start a session
                </Button>
              </div>
            )}

            {!sessionsLoading && hasAnySessions && !hasFilteredSessions && (
              <p className="mt-8 py-8 text-sm text-text-muted">
                No sessions match this filter.
              </p>
            )}

            {hasFilteredSessions && (
              <div className="mt-2">
                {filteredSessions!.map((s, i) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    ordinal={filteredCount - i}
                    onClick={() => navigate(`/sessions/${s.id}`)}
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

/**
 * Saved-questions section — appears above the Sessions list, hidden entirely
 * when the user has saved nothing. Each row is a frozen snapshot the user can
 * re-practice or open for a progress chart, plus delete. The "role" column is
 * the FROZEN `job_title` (what the question was generated for), not the live
 * profile target_role, so the card reads as an intentional snapshot.
 */
function SavedQuestionsSection({
  activeFilter,
}: {
  activeFilter: MeStatsFilter | null;
}) {
  const navigate = useNavigate();
  const { saved, isLoading, remove, rePractice } = useSavedQuestions();
  const [busyId, setBusyId] = useState<string | null>(null);
  // The saved question pending in the voice picker (null = dialog closed).
  const [pendingSq, setPendingSq] = useState<SavedQuestionListItem | null>(null);

  // Same case-insensitive company/role filter the rest of the page uses.
  const filtered = useMemo(() => {
    if (!saved || !activeFilter) return saved;
    const needle = activeFilter.value.toLowerCase();
    return saved.filter(
      (sq) =>
        (activeFilter.field === 'company' ? sq.company : sq.job_title).toLowerCase() ===
        needle,
    );
  }, [saved, activeFilter]);

  // Don't render anything (not even a heading) until we know there's at least
  // one saved question in view — an empty section would be visual noise.
  if (isLoading || !filtered || filtered.length === 0) return null;

  async function handleRePractice(sq: SavedQuestionListItem, voiceId: string | null) {
    setBusyId(sq.id);
    try {
      // Same mic preflight as Home's Begin-session, so the user lands in
      // Practice with permission already granted.
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
      // 429 = daily limit; surface via flash like Home does.
      const msg =
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : (err as Error).message;
      navigate('/', { replace: true, state: { flash: msg } });
    } finally {
      setBusyId(null);
      setPendingSq(null);
    }
  }

  return (
    <section className="anim-reveal mb-6" style={{ animationDelay: '300ms' }}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2
          className="font-display font-semibold text-text"
          style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)' }}
        >
          Saved questions
        </h2>
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle tabular-nums">
          {saved!.length}/5 saved
        </p>
      </div>
      <p className="mb-4 text-sm leading-[1.6] text-text-muted">
        Saving a question freezes its full setup — company, job title, and
        experience level — as a snapshot. Re-practicing always uses that frozen
        setup, even if you later change your profile, so every attempt answers
        the same question under the same conditions and you can watch your scores
        improve over time. You can keep up to five saved questions at once.
      </p>
      <div className="mt-2">
        {filtered.map((sq) => (
          <SavedQuestionRow
            key={sq.id}
            sq={sq}
            busy={busyId === sq.id}
            onOpen={() => navigate(`/saved-question/${sq.id}`)}
            onRePractice={() => setPendingSq(sq)}
            onDelete={() => void remove(sq.id)}
          />
        ))}
      </div>

      <RePracticeVoiceDialog
        open={pendingSq !== null}
        busy={busyId !== null}
        questionText={pendingSq?.question_text}
        onCancel={() => setPendingSq(null)}
        onStart={(voiceId) => {
          if (pendingSq) void handleRePractice(pendingSq, voiceId);
        }}
      />
    </section>
  );
}

function SavedQuestionRow({
  sq,
  busy,
  onOpen,
  onRePractice,
  onDelete,
}: {
  sq: SavedQuestionListItem;
  busy: boolean;
  onOpen: () => void;
  onRePractice: () => void;
  onDelete: () => void;
}) {
  const savedDate = new Date(sq.created_at);
  const lastPracticed = sq.last_practiced_at
    ? new Date(sq.last_practiced_at)
    : null;
  return (
    <div className="grid grid-cols-12 items-baseline gap-4 border-t border-border py-5">
      {/* Question + frozen context. Clicking opens the progress detail page. */}
      <button
        type="button"
        onClick={onOpen}
        className="col-span-12 min-[900px]:col-span-5 text-left rounded-sm px-2 -mx-2 transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface cursor-pointer"
      >
        <span className="block font-display text-base text-text leading-snug line-clamp-2">
          {sq.question_text}
        </span>
        <span className="mt-1 block text-xs text-text-subtle">
          {sq.job_title} @ {sq.company} · saved{' '}
          {savedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </button>

      <span className="col-span-4 min-[900px]:col-span-2 text-sm text-text-muted tabular-nums">
        {lastPracticed
          ? lastPracticed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—'}
        <span className="block text-xs text-text-subtle">
          {sq.attempt_count} {sq.attempt_count === 1 ? 'attempt' : 'attempts'}
        </span>
      </span>

      <span className="col-span-3 min-[900px]:col-span-2 text-sm tabular-nums">
        <span className="text-text font-medium">{fmt(sq.avg_overall_score)}</span>
        <span className="text-text-subtle">/100</span>
        <span className="block text-xs text-text-subtle">avg</span>
      </span>

      <div className="col-span-5 min-[900px]:col-span-3 flex items-center justify-end gap-3">
        <Button variant="outline" type="button" onClick={onRePractice} disabled={busy}>
          {busy ? 'Starting…' : 'Re-practice'}
        </Button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete saved question"
          title="Delete saved question"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-subtle transition-colors hover:border-border-strong hover:text-text cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Time-window for the trend charts. A numeric value windows the chart to the N
 * most recent sessions; `'all'` shows the full history (chess.com-style "Max").
 */
type RangeWindow = 5 | 10 | 20 | 'all';

const RANGE_STEPS = [5, 10, 20] as const;

/**
 * The range buttons worth showing for a given session count. A numeric window
 * >= total renders the same view as Lifetime, so it's dropped as redundant;
 * `'all'` is always appended. For <= 5 sessions only `['all']` remains, which
 * the selector treats as "nothing to choose" and hides itself.
 */
function visibleRangeOptions(total: number): RangeWindow[] {
  return [...RANGE_STEPS.filter((w) => total > w), 'all'];
}

/**
 * Reconcile the stored selection against what's actually available. Lets the
 * default stay `10` even when the user has only 7 sessions: `10` isn't a
 * visible option there, so we fall back to `'all'` (full view, Lifetime active)
 * without needing to init state from the async-loaded session count.
 */
function effectiveRange(value: RangeWindow, total: number): RangeWindow {
  return visibleRangeOptions(total).includes(value) ? value : 'all';
}

/** Window an oldest-first series to its most recent N (or pass through for `'all'`). */
function applyRange<T>(data: T[], range: RangeWindow): T[] {
  return range === 'all' ? data : data.slice(-range);
}

/**
 * Per-chart segmented control for the visible time window. Renders one pill per
 * `visibleRangeOptions(total)`; the active pill matches `effectiveRange`. Hidden
 * entirely when the only option is `'all'` (<= 5 sessions) — a single-button
 * selector is noise. Styling mirrors the dropdown trigger so the controls read
 * as one family.
 */
function RangeSelector({
  total,
  value,
  onChange,
}: {
  total: number;
  value: RangeWindow;
  onChange: (next: RangeWindow) => void;
}) {
  const options = visibleRangeOptions(total);
  if (options.length <= 1) return null; // only `'all'` — nothing to window
  const active = effectiveRange(value, total);
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="Sessions shown">
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={isActive}
            className={
              'cursor-pointer inline-flex items-center rounded-full border px-3 py-1.5 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
              (isActive
                ? 'border-border-strong text-text bg-surface-raised'
                : 'border-border text-text-subtle hover:text-text-muted')
            }
          >
            {opt === 'all' ? 'All' : `Last ${opt}`}
          </button>
        );
      })}
    </div>
  );
}
