/**
 * Speaking-pace (words per minute) bands — the two-sided sibling of
 * `session-detail/_helpers.ts:fillerRateColor`.
 *
 * Filler rate is one-sided (lower is always better), so a single proportional
 * bar reads correctly. Pace is NOT: speaking too slowly reads as cautious and
 * loses the interviewer's attention, speaking too fast reads as nervous and is
 * hard to follow. Both ends are red, so the UI draws the whole banded track and
 * marks where the candidate landed (see `SpeakingPaceBar`).
 *
 * Bands (from interview-coaching research, mirrored in the backend docstring
 * for `filler_words.speaking_pace_wpm`):
 *   <120     too slow      red
 *   120-160  on target     green
 *   160-175  slightly fast amber
 *   >175     too fast      red
 *
 * Colors reuse the `--color-rate-*` tokens that already back FillerRateBar, so
 * dark mode re-resolves for free.
 */

/** Track bounds. Values outside clamp to the ends (the band still colors correctly). */
export const PACE_TRACK_MIN = 80;
export const PACE_TRACK_MAX = 220;

export type PaceBand = {
  /** Upper bound of this band, exclusive (the last band ends at PACE_TRACK_MAX). */
  upTo: number;
  color: string;
  label: string;
};

export const PACE_BANDS: readonly PaceBand[] = [
  { upTo: 120, color: 'var(--color-rate-bad)', label: 'Slow' },
  { upTo: 160, color: 'var(--color-rate-good)', label: 'On target' },
  { upTo: 175, color: 'var(--color-rate-ok)', label: 'Slightly fast' },
  { upTo: PACE_TRACK_MAX, color: 'var(--color-rate-bad)', label: 'Fast' },
];

function bandFor(wpm: number): PaceBand {
  return PACE_BANDS.find((b) => wpm < b.upTo) ?? PACE_BANDS[PACE_BANDS.length - 1];
}

/** Traffic-light color token for a pace, as a CSS var. */
export function paceColor(wpm: number): string {
  return bandFor(wpm).color;
}

/** Human verdict for a pace ("On target", "Fast", …) — used in the aria-label. */
export function paceLabel(wpm: number): string {
  return bandFor(wpm).label;
}

/**
 * Where the marker sits along the track, as a 0-100 percent. Clamped to the
 * track bounds so a 40 wpm or 260 wpm outlier pins to an end instead of
 * escaping the bar.
 */
export function paceMarkerPct(wpm: number): number {
  const clamped = Math.min(Math.max(wpm, PACE_TRACK_MIN), PACE_TRACK_MAX);
  return ((clamped - PACE_TRACK_MIN) / (PACE_TRACK_MAX - PACE_TRACK_MIN)) * 100;
}

/** Each band's share of the track, as a 0-100 percent — the segment widths. */
export function paceBandWidthsPct(): number[] {
  const span = PACE_TRACK_MAX - PACE_TRACK_MIN;
  let prev = PACE_TRACK_MIN;
  return PACE_BANDS.map((b) => {
    const width = ((b.upTo - prev) / span) * 100;
    prev = b.upTo;
    return width;
  });
}
