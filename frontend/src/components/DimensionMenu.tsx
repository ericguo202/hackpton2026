/**
 * DimensionMenu — dropdown checklist for a trend chart's series toggles.
 *
 * A row of inline series pills wraps into a tall, cluttered block once there are
 * many series (or in a narrow column), so they collapse into this single trigger
 * button + popup of checkboxes. It owns no series state — the host page passes
 * `showOverall` / `activeDims` so toggling here mutates the host's one shared
 * selection.
 *
 * Usage differs per host: `History.tsx` (Score trend) uses this as the sole
 * control at ALL widths (the inline pills were retired there); `SavedQuestionDetail.tsx`
 * (Progress) still mounts it as the <900px variant alongside desktop pills, swapped
 * via Tailwind `hidden`. Generic over the dimension key `K` so each page keeps its
 * own `DimensionKey` union; it's passed its own `dimensions` list rather than
 * importing a const.
 *
 * No reusable popover exists in the codebase; the close-on-outside-click /
 * Escape behavior is built inline. Styling mirrors the combobox listbox
 * (`SuggestionCombobox`) and the chip family.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type DimensionItem<K extends string> = {
  key: K;
  label: string;
  color: string;
};

export default function DimensionMenu<K extends string>({
  showOverall,
  onToggleOverall,
  dimensions,
  activeDims,
  onToggleDim,
}: {
  showOverall: boolean;
  onToggleOverall: () => void;
  dimensions: readonly DimensionItem<K>[];
  activeDims: Record<K, boolean>;
  onToggleDim: (key: K) => void;
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

  // One source list so the rendered rows match the chart's series exactly.
  const rows = [
    { key: 'overall' as const, label: 'Overall', color: 'var(--color-text)' },
    ...dimensions,
  ];
  const total = rows.length;
  const activeCount =
    (showOverall ? 1 : 0) + Object.values(activeDims).filter(Boolean).length;

  function isOn(key: 'overall' | K): boolean {
    return key === 'overall' ? showOverall : activeDims[key];
  }
  function toggle(key: 'overall' | K) {
    if (key === 'overall') onToggleOverall();
    else onToggleDim(key);
  }

  return (
    <div ref={ref} className={`relative${open ? ' z-30' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 text-xs text-text bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <span>Lines</span>
        <span className="tabular-nums text-text-subtle">
          {activeCount}/{total}
        </span>
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
          aria-label="Chart lines"
          className="absolute left-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-lg"
        >
          {rows.map((row) => {
            const on = isOn(row.key);
            return (
              <button
                key={row.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => toggle(row.key)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text transition-colors hover:bg-surface-sunken cursor-pointer"
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: on ? row.color : 'transparent',
                    border: on ? 'none' : `1px solid ${row.color}`,
                  }}
                />
                <span className="flex-1 text-left">{row.label}</span>
                {on && <Check aria-hidden className="h-4 w-4 text-text-muted shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
