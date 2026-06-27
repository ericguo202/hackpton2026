/**
 * Home first-run tutorial overlay (desktop-only).
 *
 * Two phases: a centered welcome popup, then a coach-mark tour that dims the
 * page and lights up each target (`[data-tour="..."]` hooks in Home/TopBar) in
 * turn. Portaled to `document.body` at `z-[80]` so it floats above page chrome
 * (mirrors the dialog pattern in `CalibrationConsentDialog`). The parent
 * (`Home.tsx`) decides whether to mount this and owns persistence:
 *   - `onComplete` — user finished the last step (persist + close)
 *   - `onDismiss`  — user clicked "Do not show again" (persist + close)
 *   - `onSkip`     — Skip / Skip tour / Esc (close for this visit only)
 *
 * Below 900px the overlay renders nothing, matching the TopBar/Home breakpoint.
 */

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../ui/button';
import TutorialCoachCard from './TutorialCoachCard';
import { TUTORIAL_STEPS } from './steps';

const DESKTOP_MQ = '(min-width: 900px)';

const CARD_W = 320; // matches TutorialCoachCard's w-[20rem]
const GAP = 12; // space between the target and the card
const MARGIN = 16; // min distance from the viewport edge
const PAD = 6; // breathing room around the lit target

type Rect = { top: number; left: number; width: number; height: number; bottom: number };

type Props = {
  onComplete: () => void;
  onDismiss: () => void;
  onSkip: () => void;
};

function findVisibleTarget(selector: string): Rect | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
    }
  }
  return null;
}

/** Track the desktop media query reactively so a resize past 900px hides it. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export default function HomeTutorial({ onComplete, onDismiss, onSkip }: Props) {
  const isDesktop = useIsDesktop();
  const [phase, setPhase] = useState<'intro' | 'tour'>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = TUTORIAL_STEPS[stepIndex];

  // Re-locate the current target before paint (no flicker) and on viewport
  // changes. Only relevant in the tour phase.
  useLayoutEffect(() => {
    if (phase !== 'tour') return;
    // Reading the target's DOM rect is an external-system sync (we can't know
    // the position until after layout), so a direct setState here is correct.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRect(findVisibleTarget(step.selector));
  }, [phase, step.selector]);

  useEffect(() => {
    if (phase !== 'tour') return;
    const recompute = () => setRect(findVisibleTarget(step.selector));
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [phase, step.selector]);

  // Esc exits without persisting (treated like Skip), in both phases.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  if (!isDesktop) return null;

  if (phase === 'intro') {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-tutorial-title"
        className="anim-crossfade fixed inset-0 z-[80] flex items-center justify-center bg-text/40 p-4 backdrop-blur-sm"
      >
        <div className="mx-4 max-w-md rounded-2xl border border-border bg-surface-raised p-8 text-center shadow-2xl">
          <h2 id="home-tutorial-title" className="font-display text-xl text-text">
            Get the most out of InterviewPie
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            Take a quick tour of where to practice, track progress, and tailor
            your sessions.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={onSkip}>
              Skip
            </Button>
            <Button onClick={() => setPhase('tour')}>Start tutorial</Button>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-4 cursor-pointer text-xs text-text-subtle underline-offset-4 transition-colors hover:text-text-muted hover:underline focus-visible:underline focus-visible:outline-none"
          >
            Do not show again
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // Tour phase.
  const handleNext = () => {
    if (stepIndex === TUTORIAL_STEPS.length - 1) onComplete();
    else setStepIndex((i) => i + 1);
  };
  const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let cardStyle: React.CSSProperties;
  let pointerLeft = -1;
  let placement: 'top' | 'bottom' = 'bottom';

  if (rect) {
    const centerX = rect.left + rect.width / 2;
    const cardLeft = Math.max(MARGIN, Math.min(centerX - CARD_W / 2, vw - CARD_W - MARGIN));
    pointerLeft = Math.max(16, Math.min(centerX - cardLeft, CARD_W - 16));
    placement = vh - rect.bottom >= 240 ? 'bottom' : 'top';
    cardStyle =
      placement === 'bottom'
        ? { position: 'absolute', top: rect.bottom + GAP, left: cardLeft }
        : { position: 'absolute', bottom: vh - rect.top + GAP, left: cardLeft };
  } else {
    // Target not found — center the card without a pointer so the user can
    // still read the step and continue.
    cardStyle = {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80]">
      {/* Transparent click-blocker so the page underneath can't be interacted
          with mid-tour. */}
      <div className="absolute inset-0" />

      {/* Spotlight: a box-shadow spread greys everything except the target. */}
      {rect && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            // Accent ring at the edge, then a large spread that greys the rest
            // of the page. `color-mix` mirrors the `bg-text/40` backdrops used
            // elsewhere so the dim adapts to dark mode.
            boxShadow:
              '0 0 0 2px var(--color-accent), 0 0 0 9999px color-mix(in srgb, var(--color-text) 40%, transparent)',
          }}
          className="pointer-events-none rounded-md"
        />
      )}

      <div style={cardStyle}>
        <TutorialCoachCard
          body={step.body}
          stepIndex={stepIndex}
          total={TUTORIAL_STEPS.length}
          placement={placement}
          pointerLeft={pointerLeft}
          onBack={handleBack}
          onNext={handleNext}
          onSkip={onSkip}
        />
      </div>
    </div>,
    document.body,
  );
}
