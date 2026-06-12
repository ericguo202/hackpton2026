/**
 * Shared masthead for Hero and Home: the InterviewPie brand lockup on the
 * left, navigation and account controls on the right.
 *
 * `nav` slot holds inline navigation links (Practice / History) on the
 * signed-in surface. `rightSlot` holds the sign-in link on Hero and the
 * <UserButton /> on Home.
 *
 * Below 900px the inline nav collapses into a hamburger button; tapping
 * it reveals a stacked dropdown of the same nav nodes so mobile users
 * can still reach History without starting a session. The 900px cutoff
 * (vs. Tailwind's stock `md` at 768px) keeps the user-profile icon from
 * being pushed off-screen once the inline nav has three entries.
 */

import { useState, type ReactNode } from 'react';
import { Link, matchPath, useLocation } from 'react-router';
import { LEGAL_LINKS } from '../lib/legalLinks';
import BrandLockup from './BrandLockup';
import ThemeToggle from './ThemeToggle';

type Props = {
  rightSlot?: ReactNode;
  nav?: ReactNode;
  /**
   * Render the mobile hamburger + dropdown even when there's no page `nav`,
   * so a surface with no inline nav (the signed-out Hero) still exposes the
   * legal-policy links below 900px, where the footer is hidden.
   */
  legalMenu?: boolean;
};

export default function TopBar({ rightSlot, nav, legalMenu }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const showMobileMenu = Boolean(nav) || Boolean(legalMenu);
  // With page `nav`, the hamburger only fills in below 900px (the inline nav
  // covers desktop). A legal-only menu (no `nav`, e.g. signed-out Hero) has no
  // inline counterpart, so its hamburger must persist at every width.
  const collapseOnDesktop = Boolean(nav);

  return (
    <header className="relative flex items-center justify-between gap-6 px-8 md:px-16 pt-8 pb-4">
      <BrandLockup />

      <div className="flex items-center gap-4">
        {nav && (
          <nav className="hidden min-[900px]:flex items-baseline gap-6 text-xs uppercase tracking-eyebrow text-text-muted">
            {nav}
          </nav>
        )}
        {showMobileMenu && (
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
            className={
              (collapseOnDesktop ? 'min-[900px]:hidden ' : '') +
              'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm text-text transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
            }
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
        <ThemeToggle />
        {rightSlot}
      </div>

      {/*
        Mobile dropdown. Absolutely positioned beneath the header so it
        doesn't push page content down when it opens. The wrapper `onClick`
        closes the menu when any `TopBarNavLink` inside fires — the parent
        already wired navigation callbacks to each link, so we just need
        the dismissal to follow any click within this region.
      */}
      {showMobileMenu && mobileNavOpen && (
        <div
          className={
            (collapseOnDesktop ? 'min-[900px]:hidden ' : '') +
            'absolute left-0 right-0 top-full z-40 border-b border-border bg-surface px-8 py-4 shadow-sm'
          }
          onClick={() => setMobileNavOpen(false)}
        >
          {nav && (
            <nav className="flex flex-col items-start gap-4 text-xs uppercase tracking-eyebrow text-text-muted">
              {nav}
            </nav>
          )}
          {/*
            Legal-policy links live in the desktop footer (ScoreDimensions),
            which is hidden below 900px. Surface them here so mobile users
            still have a path to /legal/* without typing the URL. On a surface
            with page nav they sit under a divider; on the legal-only menu
            (signed-out Hero) they're the whole dropdown, so the divider/margin
            is dropped.
          */}
          <nav
            className={
              'flex flex-col items-start gap-3 text-eyebrow uppercase tracking-eyebrow text-text-subtle' +
              (nav ? ' mt-4 border-t border-border pt-4' : '')
            }
          >
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="cursor-pointer transition-colors hover:text-text focus-visible:outline-none focus-visible:text-text"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

/**
 * Single nav link for the TopBar. Active state is computed from the URL via
 * react-router's `matchPath`. Pass extra `matchPatterns` for routes that
 * should highlight this link without sharing its href — e.g. the History
 * link stays active on `/sessions/:id`, and the Practice link stays active
 * on `/practice` even though it links to `/`.
 */
type NavLinkProps = {
  to: string;
  matchPatterns?: string[];
  children: ReactNode;
};

export function TopBarNavLink({ to, matchPatterns, children }: NavLinkProps) {
  const { pathname } = useLocation();
  const patterns = [to, ...(matchPatterns ?? [])];
  const active = patterns.some((p) => matchPath(p, pathname) !== null);

  return (
    <Link
      to={to}
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
    </Link>
  );
}
