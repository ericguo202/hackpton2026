/**
 * Morphing page transition overlay.
 *
 * Adapted from the codrops "Morphing Page Transition" demo. Uses native
 * SVG SMIL <animate> to morph a path's d attribute from a flat edge,
 * through a wave that fully covers the page, then off the opposite edge
 * — no animation library required.
 *
 * Mounted conditionally by the parent while a view swap is in flight.
 * The parent remounts this with a fresh React key on each trigger so
 * SMIL auto-starts from frame zero.
 *
 * `direction` chooses the sweep axis:
 *   - 'up'   (default): flat at bottom -> wave covers -> off the top
 *   - 'left': flat at right -> wave covers -> off the left
 */

type MorphDirection = 'up' | 'left';

interface PageMorphTransitionProps {
  durationMs?: number;
  direction?: MorphDirection;
}

const PATHS: Record<MorphDirection, readonly [string, string, string, string]> = {
  up: [
    'M 0 100 Q 50 100 100 100 L 100 100 L 0 100 Z',
    'M 0 0 Q 50 -15 100 0 L 100 100 L 0 100 Z',
    'M 0 0 Q 50 -15 100 0 L 100 100 L 0 100 Z',
    'M 0 -100 Q 50 -115 100 -100 L 100 0 L 0 0 Z',
  ],
  left: [
    'M 100 0 Q 100 50 100 100 L 100 100 L 100 0 Z',
    'M 0 0 Q -15 50 0 100 L 100 100 L 100 0 Z',
    'M 0 0 Q -15 50 0 100 L 100 100 L 100 0 Z',
    'M -100 0 Q -115 50 -100 100 L 0 100 L 0 0 Z',
  ],
};

export default function PageMorphTransition({
  durationMs = 900,
  direction = 'up',
}: PageMorphTransitionProps) {
  const frames = PATHS[direction];
  return (
    <svg
      className="fixed inset-0 w-full h-full z-50 pointer-events-none text-accent"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <path fill="currentColor" d={frames[0]}>
        <animate
          attributeName="d"
          dur={`${durationMs}ms`}
          keyTimes="0;0.45;0.55;1"
          values={frames.join(';\n')}
          calcMode="spline"
          keySplines="0.76 0 0.24 1; 0 0 0 0; 0.76 0 0.24 1"
          fill="freeze"
        />
      </path>
    </svg>
  );
}
