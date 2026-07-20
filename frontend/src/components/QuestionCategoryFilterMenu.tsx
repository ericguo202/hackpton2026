/**
 * QuestionCategoryFilterMenu — single-select dropdown for the History
 * question-category filter (the FORM axis: Experience/STAR, Motivation & Fit,
 * Situational, Self-Assessment & Growth).
 *
 * Mirrors `FilterFieldMenu` (same trigger + radio-popup styling, outside-click /
 * Escape close). No text input — the four categories are a fixed enum, so a
 * radio menu is the right control. Value `'all'` = no category filter.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import {
  REAL_QUESTION_CATEGORIES,
  questionCategoryLabel,
} from '../types/session';

/** `'all'` (no filter) or one of the four real QuestionCategory slugs. */
export type CategoryFilter = 'all' | string;

const OPTIONS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All categories' },
  ...REAL_QUESTION_CATEGORIES.map((c) => ({
    key: c,
    label: questionCategoryLabel(c),
  })),
];

export default function QuestionCategoryFilterMenu({
  value,
  onChange,
}: {
  value: CategoryFilter;
  onChange: (next: CategoryFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];

  return (
    <div ref={ref} className={`relative${open ? ' z-30' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 text-xs text-text bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <span className="text-text-subtle">Category</span>
        <span>{current.label}</span>
        <ChevronDown
          aria-hidden
          className={
            'h-3.5 w-3.5 text-text-subtle transition-transform ' +
            (open ? 'rotate-180' : '')
          }
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Filter by question category"
          className="absolute left-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-lg"
        >
          {OPTIONS.map((opt) => {
            const on = opt.key === value;
            return (
              <button
                key={opt.key}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text transition-colors hover:bg-surface-sunken cursor-pointer"
              >
                <span className="flex-1 text-left">{opt.label}</span>
                {on && <Check aria-hidden className="h-4 w-4 text-text-muted shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
