/**
 * Filler-rate readout: a label + percent + a proportional bar colored by
 * traffic-light band (≤5 green, ≤10 yellow, ≤15 orange, >15 red — lower is
 * better). Fill width is capped at `FILLER_RATE_BAR_MAX` so high rates stay
 * legible. Returns null when the rate is unknown (no transcript / legacy row).
 *
 * Two layouts so it fits both contexts on the SessionDetail / Practice-results
 * folder card:
 *   - `block` (default) — eyebrow label + percent on one line, bar beneath.
 *     Used for the session-level rate below the Overview score tiles.
 *   - `row` — mirrors `ScoreRow`'s `[label | bar | value]` grid so it lines up
 *     with the per-turn score stack it sits under.
 */
import { FILLER_RATE_BAR_MAX, fillerRateColor } from './_helpers';

export default function FillerRateBar({
  rate,
  variant = 'block',
}: {
  rate: number | null;
  variant?: 'block' | 'row';
}) {
  if (rate == null) return null;

  const color = fillerRateColor(rate);
  const width = `${(Math.min(rate, FILLER_RATE_BAR_MAX) / FILLER_RATE_BAR_MAX) * 100}%`;
  const bar = (
    <div className="h-1.5 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full transition-all"
        style={{ width, background: color }}
      />
    </div>
  );

  if (variant === 'row') {
    return (
      <div className="grid grid-cols-[8rem_minmax(0,1fr)_2.5rem] items-center gap-3">
        <span className="text-sm text-text-muted truncate">Filler rate</span>
        {bar}
        <span className="text-xs text-text-subtle tabular-nums text-right">
          {rate.toFixed(1)}%
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Filler rate
        </span>
        <span className="text-sm font-medium tabular-nums text-text">
          {rate.toFixed(1)}%
        </span>
      </div>
      {bar}
    </div>
  );
}
