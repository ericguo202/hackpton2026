/**
 * QuestionTypeField — compact question-category picker for the Home setup basic
 * panel. Renders an inline "Question type: <label> (Change)" trigger (styled like
 * the RoleSwitcher "(Change)" link) that opens a small popover listbox of the
 * built question types.
 *
 * Question type is a primary choice (it changes the whole interview), so it sits
 * in the basic panel beside the length control rather than behind Advanced — but
 * stays quiet (one line) until the user opens the popover.
 *
 * The popover is **portaled to `document.body`** with clamped, viewport-fixed
 * coordinates, for the same two reasons as SessionLengthField: (1) the trigger
 * can sit far-left (desktop) or hard-right (narrow mobile), so a static anchor
 * clips off an edge; (2) its `.anim-reveal` ancestor has a lingering `transform`
 * that both traps a stacking context and retargets `position: fixed` — portaling
 * to the root escapes both.
 *
 * Only categories with a real prompt stack are offered (see
 * `SELECTABLE_QUESTION_CATEGORIES`); the backend rejects unbuilt values.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

import {
  SELECTABLE_QUESTION_CATEGORIES,
  questionCategoryLabel,
} from '../types/session';

// Matches the popover's `w-64`; used to clamp it within the viewport.
const POPOVER_WIDTH = 256;
const VIEWPORT_MARGIN = 8;

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** `data-tour` hook for the Home tutorial (desktop instance only). */
  tourId?: string;
};

export default function QuestionTypeField({
  value,
  onChange,
  disabled,
  tourId,
}: Props) {
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

  function select(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <span className="inline-block" data-tour={tourId}>
      <span className="text-sm text-text-subtle">
        Question type:{' '}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Change question type"
          className="cursor-pointer rounded-sm font-medium text-link underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          {questionCategoryLabel(value)}
        </button>
      </span>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            aria-label="Question type"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-40 overflow-hidden rounded-lg border border-border bg-surface-raised p-1"
          >
            {SELECTABLE_QUESTION_CATEGORIES.map((cat) => {
              const active = cat.value === value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => select(cat.value)}
                  className={
                    'flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition-colors ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
                    (active
                      ? 'bg-surface-sunken text-text'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text')
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{cat.label}</span>
                  {active && (
                    <Check className="h-4 w-4 shrink-0 text-link" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}
