/**
 * StrengthsRadar — the six rubric dimensions averaged into one profile polygon.
 *
 * Shared by `History.tsx` (averaged over the last ≤5 sessions) and
 * `SavedQuestionDetail.tsx` (averaged over the last ≤5 evaluated attempts of one
 * saved question). Unlike a per-dimension line chart (one line over time), the
 * radar reads the SHAPE: a dent on a spoke is a consistent weak area.
 *
 * The polygon is a neutral ink fill — NOT cherry, which DESIGN.md reserves for
 * primary action/selection; the ink token swaps for dark mode for free.
 * Per-dimension color lives only in the axis labels + vertex dots, matching the
 * line charts' `--color-chart-N` palette. The chart is exposed to assistive tech
 * as one labelled image (`role="img"` + aria-label) since the recharts SVG
 * carries no screen-reader text of its own.
 *
 * The averaging + Delivery-drop logic (and the dimension palette) live in the
 * sibling data module `lib/radarData.ts` — `buildRadarData` there; this file is
 * the view (kept component-only so Fast Refresh is happy). Callers feed the
 * resulting `RadarResult` into `<StrengthsRadarPanel>`.
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

import type { RadarPoint, RadarResult } from '../lib/radarData';

/** Radar tooltip — single spoke, full dimension label + 0-10 value, dot tinted
 *  with the dimension's chart color. */
function RadarTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number | null; payload: RadarPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ctx = payload[0].payload;
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
          {ctx.value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

/**
 * Angle-axis tick that tints each dimension's label with its chart color
 * (`colorByLabel`, keyed on the short tick label) — so the spokes carry the same
 * per-dimension palette as the line chart. recharts clones this element per tick,
 * injecting `x`/`y`/`textAnchor`/`payload`; `colorByLabel` is preserved.
 *
 * Multi-word labels wrap onto stacked lines (whitespace split) so the long side
 * labels ("Prob. Solving") can't overflow the SVG's right/left edge in the narrow
 * column — single-word labels render as one line, unchanged.
 */
function RadarAngleTick({ x, y, textAnchor, payload, colorByLabel }: {
  x?: number | string;
  y?: number | string;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
  payload?: { value: string };
  colorByLabel?: Record<string, string>;
}) {
  const label = payload?.value ?? '';
  const fill = colorByLabel?.[label] ?? 'var(--color-text-muted)';
  const lines = label.split(' ');
  const lineHeight = 12; // px, matches the 11px font with a little leading
  return (
    <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fontSize={11} fill={fill}>
      {lines.map((line, i) => (
        <tspan
          // reset x each line so every line honors `textAnchor`; first line lifts
          // the block so the stack stays vertically centered on the spoke.
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

/** Vertex dot tinted with its dimension's chart color (matches the axis label). */
function renderRadarDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: RadarPoint;
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

/** The radar SVG itself (no surrounding heading/caption). */
function StrengthsRadar({ data, ariaLabel }: { data: RadarPoint[]; ariaLabel: string }) {
  // shortLabel → color, so the cloned per-tick element can look up its hue.
  const colorByLabel = Object.fromEntries(data.map((d) => [d.shortLabel, d.color]));
  return (
    <div className="w-full" style={{ height: 320 }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        {/* accessibilityLayer={false}: the wrapping div is already role="img"
            with a full aria-label, so AT sees one static image. recharts 3's
            default layer would make the SVG surface tabIndex=0/role="application"
            (redundant here) and paint a focus rectangle on mouse-click. */}
        <RadarChart
          data={data}
          outerRadius="70%"
          margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
          accessibilityLayer={false}
        >
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis
            dataKey="shortLabel"
            tick={<RadarAngleTick colorByLabel={colorByLabel} />}
          />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar
            name="Average"
            dataKey="value"
            stroke="var(--color-text)"
            fill="var(--color-text)"
            fillOpacity={0.1}
            dot={renderRadarDot}
            isAnimationActive={false}
          />
          <Tooltip content={<RadarTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Drop-in radar column: eyebrow + "Last N {unit}s" caption + chart + the
 * Delivery-missing note. The host page supplies the grid wrapper (e.g.
 * `min-[900px]:col-span-1`) and the `RadarResult` from `buildRadarData`.
 * `unitLabel` is the singular noun for the window ("session" / "attempt").
 */
export function StrengthsRadarPanel({
  radar,
  unitLabel = 'session',
}: {
  radar: RadarResult | null;
  unitLabel?: string;
}) {
  // Screen-reader alternative for the radar SVG: read the actual averaged scores.
  const ariaLabel = useMemo(() => {
    if (!radar || radar.data.length === 0) return '';
    const parts = radar.data.map((d) => `${d.dimension} ${d.value.toFixed(1)} out of 10`);
    const tail = radar.deliveryMissing
      ? ` Delivery is not shown because no recent ${unitLabel} used a webcam.`
      : '';
    return (
      `Strengths and weaknesses radar chart. Average scores across your last ` +
      `${radar.windowCount} ${unitLabel}${radar.windowCount === 1 ? '' : 's'}: ` +
      `${parts.join(', ')}.${tail}`
    );
  }, [radar, unitLabel]);

  return (
    <div>
      <div className="mb-6">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle">
          Strengths &amp; weaknesses
        </p>
        {radar && radar.windowCount > 0 && (
          <p className="mt-1 text-xs text-text-subtle tabular-nums">
            Last {radar.windowCount} {unitLabel}{radar.windowCount === 1 ? '' : 's'}
          </p>
        )}
      </div>
      {radar && radar.data.length > 0 && (
        <>
          <StrengthsRadar data={radar.data} ariaLabel={ariaLabel} />
          {radar.deliveryMissing && (
            <p className="mt-2 text-xs text-text-subtle">
              Delivery needs webcam — not enough recorded {unitLabel}s.
            </p>
          )}
        </>
      )}
    </div>
  );
}
