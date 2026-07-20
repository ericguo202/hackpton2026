/**
 * CategoryStrengthsRadar — the History page's default (all-categories) radar.
 *
 * Unlike `StrengthsRadar` (six rubric DIMENSIONS averaged over recent sessions),
 * this plots one spoke per QUESTION CATEGORY (Experience/STAR, Motivation & Fit,
 * Situational, Self-Assessment & Growth). Each vertex's value is that category's
 * average content score (mean of its five content dimensions, 0-10). Categories
 * the user hasn't practiced plot as 0, so the four-vertex shape is always
 * present — it reads as "which question types am I strong/weak at". Hovering a
 * spoke shows the average score AND how many turns fed it.
 *
 * Data comes from `buildCategoryRadarData(stats.by_category)`. Like
 * `StrengthsRadar`, the polygon is neutral ink (DESIGN.md reserves cherry for
 * action); per-category color lives on the axis labels + vertex dots.
 */

import { useMemo } from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { CategoryRadarPoint } from '../lib/radarData';

/** Tooltip — category label, average score (0-10), and turns evaluated. */
function CategoryRadarTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number | null; payload: CategoryRadarPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ctx = payload[0].payload;
  const turns = ctx.turnsEvaluated;
  return (
    <div className="rounded-md bg-surface-raised border border-border px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: ctx.color }}
        />
        <span className="text-text-muted">{ctx.dimension}</span>
        <span className="text-text font-medium tabular-nums ml-auto">
          {turns === 0 ? '—' : ctx.value.toFixed(1)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-text-subtle tabular-nums">
        {turns} turn{turns === 1 ? '' : 's'} evaluated
      </p>
    </div>
  );
}

/**
 * Angle-axis tick tinting each category label with its spoke color. Multi-word
 * short labels wrap onto stacked lines so a long label can't overflow the SVG
 * edge in the narrow 1/3 column. Mirrors `StrengthsRadar`'s `RadarAngleTick`.
 */
function CategoryAngleTick({ x, y, textAnchor, payload, colorByLabel }: {
  x?: number | string;
  y?: number | string;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
  payload?: { value: string };
  colorByLabel?: Record<string, string>;
}) {
  const label = payload?.value ?? '';
  const fill = colorByLabel?.[label] ?? 'var(--color-text-muted)';
  const lines = label.split(' ');
  const lineHeight = 12;
  return (
    <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fontSize={11} fill={fill}>
      {lines.map((line, i) => (
        <tspan
          key={line}
          x={x}
          dy={i === 0 ? -((lines.length - 1) * lineHeight) / 2 : lineHeight}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Vertex dot tinted with its category's color (matches the axis label). */
function renderCategoryDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: CategoryRadarPoint;
}) {
  const { cx, cy, index, payload } = props;
  if (cx == null || cy == null || !payload) return <g key={index} />;
  return (
    <circle
      key={index}
      cx={cx}
      cy={cy}
      r={3}
      fill={payload.color}
      stroke="var(--color-surface-raised)"
      strokeWidth={1}
    />
  );
}

/**
 * Drop-in category radar column: eyebrow + caption + chart. The host page
 * supplies the grid wrapper and the `CategoryRadarPoint[]` from
 * `buildCategoryRadarData`.
 */
export function CategoryStrengthsRadarPanel({ data }: { data: CategoryRadarPoint[] }) {
  const colorByLabel = useMemo(
    () => Object.fromEntries(data.map((d) => [d.shortLabel, d.color])),
    [data],
  );

  const ariaLabel = useMemo(() => {
    if (data.length === 0) return '';
    const parts = data.map(
      (d) =>
        `${d.dimension} ${d.turnsEvaluated === 0 ? 'no turns yet' : `${d.value.toFixed(1)} out of 10 over ${d.turnsEvaluated} turn${d.turnsEvaluated === 1 ? '' : 's'}`}`,
    );
    return `Strengths and weaknesses by question category. ${parts.join(', ')}.`;
  }, [data]);

  return (
    <div>
      <div className="mb-6">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle">
          Strengths &amp; weaknesses
        </p>
        <p className="mt-1 text-xs text-text-subtle">By question category</p>
      </div>
      <div className="w-full" style={{ height: 320 }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            outerRadius="70%"
            margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
            accessibilityLayer={false}
          >
            <PolarGrid stroke="var(--color-border)" />
            <PolarAngleAxis
              dataKey="shortLabel"
              tick={<CategoryAngleTick colorByLabel={colorByLabel} />}
            />
            <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
            <Radar
              name="Average"
              dataKey="value"
              stroke="var(--color-text)"
              fill="var(--color-text)"
              fillOpacity={0.1}
              dot={renderCategoryDot}
              isAnimationActive={false}
            />
            <Tooltip content={<CategoryRadarTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
