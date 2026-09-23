/**
 * SessionLengthField — compact interview-length control for the Home setup
 * basic panel. Renders an inline "Length: N turns" trigger (styled like the
 * RoleSwitcher "(Change)" link) that opens a small popover holding the 2–8
 * slider.
 *
 * Length is a primary choice, so it sits in the basic panel beside the quick
 * toggles rather than behind Advanced — but stays quiet (one line) until the
 * user opens the popover to change it.
 *
 * The popover is **portaled to `document.body`** with clamped, viewport-fixed
 * coordinates (mirrors the Ask Tutor window). Two reasons it can't be a plain
 * `absolute` child: (1) the trigger can sit anywhere from far-left (desktop) to
 * hard-right (narrow mobile), so a static `left-0`/`right-0` anchor clips off
 * one edge; measuring + clamping keeps it on-screen everywhere. (2) Its
 * `.anim-reveal` ancestor has a lingering `transform` (forwards fill), which
 * both traps a nested stacking context and would retarget `position: fixed` to
 * that ancestor — portaling to the root escapes both.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const MIN_SESSION_TURNS = 2;
export const MAX_SESSION_TURNS = 8;

// Matches the popover's `w-64`; used to clamp it within the viewport.
const POPOVER_WIDTH = 256;
const VIEWPORT_MARGIN = 8;

type Props = {
  // Distinct per breakpoint: both slabs mount this (one hidden via CSS), so
  // the slider inside must not share a DOM id.
  id?: string;
  // First-run tour hook. Set only on the desktop instance (the mobile slab
  // has no `data-tour` targets), so the coach mark lands on the visible one.
  tourId?: string;
  numTurns: number;
  onChange: (value: number) => void;
  disabled: boolean;
  /**
   * Upper bound for the slider, defaulting to the absolute max. Home passes the
   * free-tier turns left today so an over-budget length can't be picked in the
   * first place — the backend clamps `num_turns` on its own, and letting the
   * user set 8 only to receive a 3-turn session is a worse experience than
   * showing them the real ceiling up front.
   */
  maxTurns?: number;
};

export default function SessionLengthField({
  id = 'session-turns',
  tourId,
  numTurns,
  onChange,
  disabled,
  maxTurns = MAX_SESSION_TURNS,
}: Props) {
  // Never below the floor — a caller with 0-1 turns left would otherwise pass a
  // max under the min and invert the range. Home blocks that case before the
  // session starts; this just keeps the control coherent if it renders anyway.
  const effectiveMax = Math.max(MIN_SESSION_TURNS, Math.min(MAX_SESSION_TURNS, maxTurns));
  const capped = effectiveMax < MAX_SESSION_TURNS;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Anchor the popover under the trigger, clamped into the viewport so it never
  // clips off the right (hard-right trigger on mobile) or left (narrow phone).
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
      const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
      const left = Math.min(Math.max(VIEWPORT_MARGIN, r.left), maxLeft);
      setPos({ top: r.bottom + VIEWPORT_MARGIN, left, width });
    }
    reposition();
    window.addEventListener('resize', reposition);
    // Capture phase so a scroll on any ancestor keeps the popover aligned.
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // Close on outside click or ESC. The popover is portaled out of the trigger's
  // subtree, so the hit-test checks both the trigger and the popover.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="inline-block" data-tour={tourId}>
      <span className="text-sm text-text-subtle">
        Length:{' '}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Change interview length"
          className="cursor-pointer rounded-sm font-medium tabular-nums text-link underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          {numTurns} turns
        </button>
      </span>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Interview length"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-40 rounded-lg border border-border bg-surface-raised p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <label
                htmlFor={id}
                className="text-sm font-medium text-text-muted"
              >
                Length
              </label>
              <span className="text-sm font-semibold tabular-nums text-text">
                {numTurns} turns
              </span>
            </div>
            <input
              id={id}
              type="range"
              min={MIN_SESSION_TURNS}
              max={effectiveMax}
              step={1}
              value={numTurns}
              disabled={disabled}
              onChange={(e) => onChange(Number(e.target.value))}
              aria-valuetext={`${numTurns} turns`}
              className="mt-3 h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="mt-1 flex items-center justify-between text-xs tabular-nums text-text-subtle">
              <span>{MIN_SESSION_TURNS}</span>
              <span>{effectiveMax}</span>
            </div>
            <p className="mt-2 text-xs text-text-subtle">
              Each turn is one question from the interviewer. Two by default.
              {capped
                ? ` You have ${effectiveMax} question${effectiveMax === 1 ? '' : 's'} left today.`
                : ''}
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
}
