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
 */

import type { ReactNode } from 'react';

type Props = {
  rightSlot?: ReactNode;
  nav?: ReactNode;
};

export default function TopBar({ rightSlot, nav }: Props) {
  return (
    <header className="flex items-baseline justify-between gap-6 px-8 md:px-16 pt-8 pb-4">
      <div className="flex items-baseline gap-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        <span className="font-medium text-text tabular-nums">No. 01</span>
        <span aria-hidden>·</span>
        <span>Interview Practice</span>
        <span aria-hidden className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">Behavioral Rounds</span>
      </div>
      {nav && (
        <nav className="hidden md:flex items-baseline gap-6 text-eyebrow uppercase tracking-eyebrow text-text-muted">
          {nav}
        </nav>
      )}
      {rightSlot}
    </header>
  );
}

/**
 * Single nav link for the TopBar — rendered as a link-styled <button> since
 * the app drives navigation via state, not URLs. Active state uses the same
 * full-strength `text` token the masthead "No. 01" uses.
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
        'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
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
