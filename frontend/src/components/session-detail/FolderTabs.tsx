/**
 * Folder-tab navigation for SessionDetail.
 *
 * Three tabs (Overview · Turn 1 · Turn 2) shaped like binder/file-folder
 * tabs sitting on top of the dark-beige session card. Active tab fills
 * with `accent` ink; inactive tabs are dark beige (matching the card
 * body) so they read as "all one piece of paper with the front file
 * pulled forward." The strip overlaps the card by 1px so there's no
 * visual seam between the active tab and the panel below.
 *
 * `SideNavButton` (also exported here) is the circular ← / → button that
 * sits outside the card on the left/right gutters with a hover tooltip
 * pill. It shares the design language so it lives in the same module.
 *
 * Both are desktop-only — the orchestrator gates them with
 * `hidden min-[900px]:flex`.
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
      className="relative z-10 -mb-px hidden min-[900px]:flex items-end gap-1"
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
              'min-w-[7rem] cursor-pointer rounded-t-lg border border-b-0 px-5 py-2.5 ' +
              'text-eyebrow uppercase tracking-eyebrow transition-colors ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ' +
              'focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
              (active
                // Light: black ink tab on the dark-beige card (high contrast,
                // by design). Dark: match the card's fill + border so the tab
                // merges seamlessly instead of jutting out as a lighter block;
                // the near-black text-accent-fg still sets it apart from the
                // muted inactive tabs.
                ? 'border-accent bg-accent text-accent-fg dark:border-border-strong dark:bg-tertiary-200'
                // Dark: recess the inactive tabs to a grayer manila (300) so
                // they read as unselected vs the active tab / card (200), then
                // lift back to the card color on hover. Keeps the literal
                // `bg-tertiary-200` class so the index.css text re-scope still
                // resolves the label to dark ink on the light manila.
                : 'border-border-strong bg-tertiary-200 text-text-muted hover:bg-tertiary-300 hover:text-text dark:bg-tertiary-300 dark:hover:bg-tertiary-200')
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
        'transition-colors hover:bg-tertiary-200 ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ' +
        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
      }
    >
      {isNext ? <ChevronRight size={20} aria-hidden /> : <ChevronLeft size={20} aria-hidden />}
    </button>
  );
}
