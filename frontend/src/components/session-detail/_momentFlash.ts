/**
 * Per-turn "flash channel" linking the transcript card to the Improvement
 * Moments card. The two live in separate sibling components, so clicking a
 * highlighted snippet in `QuestionAnswerCard` needs a shared state path to
 * reach the matching `<li>` in `ImprovementMomentsCard`.
 *
 * Pure `.ts` (context + hooks only). The `<MomentFlashContext.Provider>` JSX is
 * used inline inside the panel components — keeping a React component out of
 * this file avoids tripping `react-refresh/only-export-components`.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';

/** Stable DOM id for a turn's improvement moment, shared by both cards. */
export function improvementMomentDomId(turnId: string, index: number): string {
  return `improvement-moment-${turnId}-${index}`;
}

type FlashState = { index: number; nonce: number } | null;

export type MomentFlashValue = {
  /** Which moment is currently flashing (with a monotonic nonce to replay). */
  flash: FlashState;
  /** Scroll the moment into view and flash its border. */
  triggerFlash: (index: number) => void;
  /** Resolve a moment index to its shared DOM id. */
  domIdFor: (index: number) => string;
};

export const MomentFlashContext = createContext<MomentFlashValue>({
  flash: null,
  triggerFlash: () => {},
  domIdFor: () => '',
});

export function useMomentFlash(): MomentFlashValue {
  return useContext(MomentFlashContext);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * Owns the flash state for one turn. Feed the returned value straight into a
 * `<MomentFlashContext.Provider value={...}>` wrapping both cards.
 *
 * Scrolling happens in an effect (post-render) so the target `<li>` exists even
 * after a re-key remount, and so a repeat click of the same snippet re-fires
 * (the nonce changes, the effect re-runs).
 */
export function useProvideMomentFlash(turnId: string): MomentFlashValue {
  const [flash, setFlash] = useState<FlashState>(null);
  const nonceRef = useRef(0);

  const domIdFor = (index: number) => improvementMomentDomId(turnId, index);

  const triggerFlash = (index: number) => {
    nonceRef.current += 1;
    setFlash({ index, nonce: nonceRef.current });
  };

  useEffect(() => {
    if (!flash) return;
    const el = document.getElementById(improvementMomentDomId(turnId, flash.index));
    el?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [flash, turnId]);

  return { flash, triggerFlash, domIdFor };
}
