/**
 * Morphing page transition overlay.
 *
 * Adapted from the codrops "Morphing Page Transition" demo. Uses native
 * SVG SMIL <animate> to morph a path's d attribute from a flat line at
 * the bottom of the viewport, through a wave that fully covers the page,
 * then up to a flat line off the top — no animation library required.
 *
 * Mounted conditionally by SignedOutApp while a view swap is in flight.
 * The parent remounts this with a fresh React key on each trigger so
 * SMIL auto-starts from frame zero.
 */

interface PageMorphTransitionProps {
  durationMs?: number;
}

export default function PageMorphTransition({ durationMs = 900 }: PageMorphTransitionProps) {
  return (
    <svg
      className="fixed inset-0 w-full h-full z-50 pointer-events-none text-accent"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <path fill="currentColor" d="M 0 100 Q 50 100 100 100 L 100 100 L 0 100 Z">
        <animate
          attributeName="d"
          dur={`${durationMs}ms`}
          keyTimes="0;0.45;0.55;1"
          values="
            M 0 100 Q 50 100 100 100 L 100 100 L 0 100 Z;
            M 0 0 Q 50 -15 100 0 L 100 100 L 0 100 Z;
            M 0 0 Q 50 -15 100 0 L 100 100 L 0 100 Z;
            M 0 -100 Q 50 -115 100 -100 L 100 0 L 0 0 Z
          "
          calcMode="spline"
          keySplines="0.76 0 0.24 1; 0 0 0 0; 0.76 0 0.24 1"
          fill="freeze"
        />
      </path>
    </svg>
  );
}
