/**
 * FilterFieldMenu — single-select dropdown for the History filter dimension.
 *
 * Mirrors DimensionMenu's trigger-button + popup styling exactly, but is a
 * single-select radio group (No filter / Company / Role) rather than a
 * checklist. Chosen over a segmented pill trio so it stays compact on mobile,
 * leaving the autocomplete input room to stretch on the same row.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type FilterField = 'none' | 'company' | 'job_title';

const OPTIONS: { key: FilterField; label: string }[] = [
  { key: 'none', label: 'No filter' },
  { key: 'company', label: 'Company' },
  { key: 'job_title', label: 'Role' },
];

export default function FilterFieldMenu({
  value,
  onChange,
}: {
  value: FilterField;
  onChange: (next: FilterField) => void;
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
        <span className="text-text-subtle">Filter</span>
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
          aria-label="Filter sessions by"
          className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-lg"
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
