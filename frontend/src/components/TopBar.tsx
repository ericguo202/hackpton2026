/**
 * Shared editorial masthead for Hero and Home.
 *
 * The wordmark is intentionally metadata-style — issue number, section,
 * sub-section — rather than a logo. This sets the "publication" tone
 * established in .impeccable.md (premium, quiet, intentional).
 *
 * `nav` slot holds inline navigation links (Practice / History) on the
 * signed-in surface. `rightSlot` holds the sign-in link on Hero and the
 * <UserButton /> on Home.
 *
 * Below the `md` breakpoint the inline nav collapses into a hamburger
 * button; tapping it reveals a stacked dropdown of the same nav nodes
 * so mobile users can still reach History without starting a session.
 */

import { useState, type ReactNode } from 'react';

type Props = {
  rightSlot?: ReactNode;
  nav?: ReactNode;
};

export default function TopBar({ rightSlot, nav }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="relative flex items-center justify-between gap-6 px-8 md:px-16 pt-8 pb-4">
      <div className="flex items-baseline gap-3 text-eyebrow text-[14px] uppercase tracking-eyebrow text-text-muted">
        <span className="font-medium text-text tabular-nums">Logos</span>
        <span aria-hidden>·</span>
        <span>Interview Practice</span>
        <span aria-hidden className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">Behavioral Rounds</span>
      </div>

      <div className="flex items-center gap-4">
        {nav && (
          <nav className="hidden md:flex items-baseline gap-6 text-eyebrow text-[14px] uppercase tracking-eyebrow text-text-muted">
            {nav}
          </nav>
        )}
        {nav && (
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
            className="md:hidden inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm text-text transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {mobileNavOpen ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>
        )}
        {rightSlot}
      </div>

      {/*
        Mobile dropdown. Absolutely positioned beneath the header so it
        doesn't push page content down when it opens. The wrapper `onClick`
        closes the menu when any `TopBarNavLink` inside fires — the parent
        already wired navigation callbacks to each link, so we just need
        the dismissal to follow any click within this region.
      */}
      {nav && mobileNavOpen && (
        <div
          className="md:hidden absolute left-0 right-0 top-full z-40 border-b border-border bg-surface px-8 py-4 shadow-sm"
          onClick={() => setMobileNavOpen(false)}
        >
          <nav className="flex flex-col items-start gap-4 text-eyebrow text-[14px] uppercase tracking-eyebrow text-text-muted">
            {nav}
          </nav>
        </div>
      )}
    </header>
  );
}

/**
 * Single nav link for the TopBar — rendered as a link-styled <button> since
 * the app drives navigation via state, not URLs. Active state uses the same
 * full-strength `text` token the masthead "Logos" uses.
 */
type NavLinkProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function TopBarNavLink({ active, onClick, children }: NavLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        'cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
        'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
        'focus-visible:ring-offset-surface rounded-sm ' +
        (active
          ? 'text-text font-medium'
          : 'text-text-muted hover:text-text')
      }
    >
      {children}
    </button>
  );
}
