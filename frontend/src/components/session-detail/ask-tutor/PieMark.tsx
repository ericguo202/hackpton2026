/**
 * The InterviewPie pie mark, standalone (no wordmark) — the tutor's avatar.
 *
 * Geometry copied verbatim from `public/logo.svg`'s icon group (amber crust +
 * cherry slice) with a centered viewBox so it scales to any size. This is the
 * sanctioned place the pie lives (DESIGN.md: "the pie is a mark, not a theme
 * park"); the fills are the brand constants, exempt from the amber/cherry
 * text-contrast rules because it's artwork, not type.
 */

export function PieMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-160 -160 320 320"
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
