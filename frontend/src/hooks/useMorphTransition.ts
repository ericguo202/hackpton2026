/**
 * Shared timing coordination for the `PageMorphTransition` overlay.
 *
 * The morph covers the viewport for 900ms total, fully opaque around
 * the ~450ms mark. `trigger(commit)` schedules `commit()` to run at
 * that mid-point so the downstream state change (route swap, phase
 * change) lands while the screen is covered — the user never sees a
 * flash of the outgoing or incoming content directly.
 *
 * Consumers render `<PageMorphTransition key={transitionKey} />` while
 * `transitioning === true`. The fresh `key` on each trigger remounts
 * the SVG so SMIL restarts from frame zero.
 *
 * Honors `prefers-reduced-motion`: commits synchronously, no overlay.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const SWAP_AT_MS = 450;
const TRANSITION_MS = 900;

export function useMorphTransition() {
  const [transitioning, setTransitioning] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);

  const transitioningRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  const trigger = useCallback((commit: () => void) => {
    if (transitioningRef.current) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      commit();
      return;
    }

    transitioningRef.current = true;
    setTransitioning(true);
    setTransitionKey((k) => k + 1);

    const swapId = window.setTimeout(() => commit(), SWAP_AT_MS);
    const endId = window.setTimeout(() => {
      transitioningRef.current = false;
      setTransitioning(false);
    }, TRANSITION_MS);
    timeoutsRef.current.push(swapId, endId);
  }, []);

  return { trigger, transitioning, transitionKey };
}
