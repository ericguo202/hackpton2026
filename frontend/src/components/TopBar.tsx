/**
 * Shared editorial masthead for Hero and Home.
 *
 * The wordmark is intentionally metadata-style — issue number, section,
 * sub-section — rather than a logo. This sets the "publication" tone
 * established in .impeccable.md (premium, quiet, intentional).
 *
 * `rightSlot` holds the sign-in link on Hero and the <UserButton /> on Home.
 */

import type { ReactNode } from 'react';

type Props = { rightSlot?: ReactNode };

export default function TopBar({ rightSlot }: Props) {
  return (
    <header className="flex items-baseline justify-between px-8 md:px-16 pt-8 pb-4">
      <div className="flex items-baseline gap-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        <span className="font-medium text-text tabular-nums">No. 01</span>
        <span aria-hidden>·</span>
        <span>Interview Practice</span>
        <span aria-hidden className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">Behavioral Rounds</span>
      </div>
      {rightSlot}
    </header>
  );
}
