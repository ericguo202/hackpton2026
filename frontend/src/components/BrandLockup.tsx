/**
 * InterviewPie brand lockup: the scalloped pie mark + wordmark.
 *
 * The mark's paths are copied from public/favicon.svg (the committed brand
 * source of truth) so the TopBar never loads a raster. The wordmark is real
 * text in DM Sans 700 — "Interview" in ink, "Pie" in brand cherry — rather
 * than the outlined logo.svg, so it follows the theme tokens and stays
 * selectable/zoomable. Cherry on the dark surface clears 3:1 only at
 * large/bold sizes, which the wordmark always is; don't reuse this treatment
 * for body-size text.
 */

import { Link } from 'react-router';

export function PieMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-158 -164 316 316"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FFA630"
        d="M 0 -139.37 A 50 50 0 0 0 -69.69 -120.7 A 50 50 0 0 0 -120.7 -69.69 A 50 50 0 0 0 -139.37 -0 A 50 50 0 0 0 -120.7 69.69 A 50 50 0 0 0 -69.69 120.7 A 50 50 0 0 0 -0 139.37 A 50 50 0 0 0 69.69 120.7 A 50 50 0 0 0 120.7 69.69 A 50 50 0 0 0 139.37 0 L 12 -0 A 12 12 0 0 1 0 -12 L 0 -139.37 Z"
      />
      <path
        fill="#C41E3A"
        d="M 24.5 -12.5 L 151.87 -12.5 A 50 50 0 0 0 133.2 -82.19 A 50 50 0 0 0 82.19 -133.2 A 50 50 0 0 0 12.5 -151.87 L 12.5 -24.5 A 12 12 0 0 0 24.5 -12.5 Z"
      />
    </svg>
  );
}

type Props = {
  /** Where the lockup links. Defaults to the app root. */
  to?: string;
};

export default function BrandLockup({ to = '/' }: Props) {
  return (
    <Link
      to={to}
      aria-label="InterviewPie home"
      className="inline-flex cursor-pointer items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <PieMark className="h-7 w-7 shrink-0" />
      <span className="font-display text-xl font-bold leading-none tracking-[-0.02em] text-text">
        Interview<span className="text-cherry">Pie</span>
      </span>
    </Link>
  );
}
