/**
 * Speaking-pace readout: a label + "N wpm" + a banded track with a marker at
 * the candidate's pace. Sibling of `FillerRateBar`, with the same two layouts
 * and the same null contract, so it drops into both of that bar's slots.
 *
 * Why a banded track instead of a proportional fill: pace is TWO-SIDED (too
 * slow and too fast are both red), so a fill that grows with the value would
 * imply "more is better". Drawing the whole track tinted by band also teaches
 * the target range — the candidate can see where 120-160 sits, not just that
 * they missed it.
 *
 * Returns null when the pace is unknown — a legacy turn with no measured speech
 * span, or an answer too short for words-per-minute to mean anything (the
 * backend's `MIN_WORDS_FOR_PACE` floor). Never renders a fabricated 0.
 */
import {
  PACE_BANDS,
  paceBandWidthsPct,
  paceColor,
  paceLabel,
  paceMarkerPct,
} from '../../lib/speakingPace';

export default function SpeakingPaceBar({
  wpm,
  variant = 'block',
}: {
  wpm: number | null;
  variant?: 'block' | 'row';
}) {
  if (wpm == null) return null;

  const widths = paceBandWidthsPct();
  const track = (
    <div
      className="relative h-2 overflow-hidden rounded-full"
      role="img"
      aria-label={`Speaking pace ${wpm} words per minute — ${paceLabel(wpm)}`}
    >
      {/* Band segments, tinted so the solid marker reads against them. */}
      <div className="absolute inset-0 flex">
        {PACE_BANDS.map((band, i) => (
          <div
            key={band.upTo}
            style={{
              width: `${widths[i]}%`,
              background: `color-mix(in srgb, ${band.color} 30%, transparent)`,
            }}
          />
        ))}
      </div>
      {/* Marker. -translate-x-1/2 centers it on the value; the ends clamp, so
          it never renders half-outside the track. */}
      <div
        className="absolute top-0 h-full w-0.5 -translate-x-1/2 rounded-full"
        style={{
          left: `${paceMarkerPct(wpm)}%`,
          background: paceColor(wpm),
        }}
      />
    </div>
  );

  if (variant === 'row') {
    // Value column is wider than FillerRateBar's — "148 wpm" doesn't fit 2.5rem.
    return (
      <div className="grid grid-cols-[8rem_minmax(0,1fr)_3.5rem] items-center gap-3">
        <span className="text-sm text-text-muted truncate">Speaking pace</span>
        {track}
        <span className="text-xs text-text-subtle tabular-nums text-right">
          {wpm} wpm
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Speaking pace
        </span>
        <span className="text-sm font-medium tabular-nums text-text">
          {wpm} wpm
        </span>
      </div>
      {track}
    </div>
  );
}
