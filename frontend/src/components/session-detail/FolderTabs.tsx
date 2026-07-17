/**
 * Folder-tab navigation for SessionDetail.
 *
 * Folder tabs (Overview · Turn N) keep the binder/file-folder
 * silhouette on top of the session card, on the theme-following neutrals
 * (DESIGN.md §5 Folder Tabs): inactive tabs sit in the sunken tone, the
 * active tab shares the card fill so it fuses seamlessly with the panel
 * below (the strip overlaps the card by 1px to hide the seam). Labels are
 * DM Sans 600.
 *
 * `SideNavButton` (also exported here) is the circular ← / → button that
 * sits outside the card on the left/right gutters with a hover tooltip
 * pill. It shares the design language so it lives in the same module.
 *
 * `FolderTabs` + `SideNavButton` are desktop-only (gated with
 * `hidden min-[900px]:flex`). `PagerArrow` is their mobile counterpart: the
 * chevron in the top pager row that replaces both below 900px, where the
 * bottom edge is reserved for the floating Ask Tutor + feedback buttons.
 */

import { useRef, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type FolderTab = {
  /** Display label shown on the tab. */
  label: string;
  /** Element id on the tab button — referenced by aria-labelledby on the panel. */
  tabId: string;
  /** Element id of the panel this tab controls — referenced by aria-controls. */
  panelId: string;
};

type FolderTabsProps = {
  tabs: FolderTab[];
  activeIndex: number;
  onChange: (index: number) => void;
};

export function FolderTabs({ tabs, activeIndex, onChange }: FolderTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      onChange(idx - 1);
      tabRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < tabs.length - 1) {
      e.preventDefault();
      onChange(idx + 1);
      tabRefs.current[idx + 1]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(0);
      tabRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(tabs.length - 1);
      tabRefs.current[tabs.length - 1]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Session sections"
      className="relative z-10 -mb-px hidden max-w-full items-end gap-1 overflow-x-auto overflow-y-hidden min-[900px]:flex"
    >
      {tabs.map((tab, idx) => {
        const active = idx === activeIndex;
        return (
          <button
            key={tab.tabId}
            ref={(el) => { tabRefs.current[idx] = el; }}
            id={tab.tabId}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={tab.panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={
              'min-w-[5.75rem] shrink-0 cursor-pointer rounded-t-lg border border-b-0 px-3 py-2.5 ' +
              'min-[1200px]:min-w-[6.5rem] min-[1200px]:px-4 ' +
              'font-display text-sm font-semibold transition-colors ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ' +
              'focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
              (active
                // Shares the card fill + border so the tab fuses to the panel
                // ("the front file pulled forward"); the 1px overlap below
                // hides the card's top border under it.
                ? 'border-border-strong bg-surface-raised text-text'
                // Inactive tabs recess into the sunken tone and lift toward
                // the card fill on hover.
                : 'border-border-strong bg-surface-sunken text-text-muted hover:bg-surface-raised hover:text-text')
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

type SideNavButtonProps = {
  direction: 'prev' | 'next';
  onClick: () => void;
  /** Visible target name, e.g. "Turn 1" — used inside the tooltip text. */
  targetLabel: string;
  /** When true, render an invisible spacer so the card doesn't reflow. */
  hidden?: boolean;
};

/**
 * Circular ← / → button that sits in the gutter outside the card. Uses the
 * native browser `title` attribute for the hover hint — an earlier custom
 * tooltip pill (absolutely-positioned span inside the button) was scrapped
 * because the sticky wrapper around the button applies a `transform:
 * translateY(-50%)`, which creates a new containing block that absolute
 * descendants resolve against in unexpected ways across browsers. The
 * native tooltip is plain but reliable.
 */
export function SideNavButton({ direction, onClick, targetLabel, hidden = false }: SideNavButtonProps) {
  const isNext = direction === 'next';
  const ariaLabel = isNext ? `Go to next tab: ${targetLabel}` : `Go to previous tab: ${targetLabel}`;
  const tooltip = isNext ? 'Go to next tab' : 'Go to previous tab';

  if (hidden) {
    return <div aria-hidden className="h-11 w-11" />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={tooltip}
      className={
        'inline-flex h-11 w-11 cursor-pointer items-center justify-center ' +
        'rounded-full border border-border-strong bg-surface-raised text-text ' +
        'transition-colors hover:bg-surface-sunken ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ' +
        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
      }
    >
      {isNext ? <ChevronRight size={20} aria-hidden /> : <ChevronLeft size={20} aria-hidden />}
    </button>
  );
}

type PagerArrowProps = {
  direction: 'prev' | 'next';
  onClick: () => void;
  /** Inert (greyed, non-interactive) at the first/last tab. */
  disabled: boolean;
  /** Target tab name for the accessible label, e.g. "Turn 1". */
  label?: string;
};

/**
 * Chevron button for the mobile top pager. Reuses SideNavButton's circular
 * 44px vocabulary (a comfortable touch target) and adds a disabled end-state
 * so the pager keeps its symmetric three-slot layout (arrow · position ·
 * arrow) instead of collapsing. Uses `active:` not `hover:` for press
 * feedback since touch has no reliable hover.
 */
export function PagerArrow({ direction, onClick, disabled, label }: PagerArrowProps) {
  const isNext = direction === 'next';
  const ariaLabel = disabled
    ? isNext ? 'No next tab' : 'No previous tab'
    : isNext ? `Go to next tab: ${label}` : `Go to previous tab: ${label}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ' +
        'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
        'focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
        (disabled
          ? 'cursor-not-allowed border-border bg-surface-sunken text-text-muted/40'
          : 'cursor-pointer border-border-strong bg-surface-raised text-text active:bg-surface-sunken')
      }
    >
      {isNext ? <ChevronRight size={20} aria-hidden /> : <ChevronLeft size={20} aria-hidden />}
    </button>
  );
}
