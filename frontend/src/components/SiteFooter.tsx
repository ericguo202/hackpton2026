/**
 * Site footer — brand/copyright on the left, grouped link columns on the
 * right. Shared by the signed-out Hero and the signed-in Home; replaces the
 * old `LandingFooter` (Hero) and `ScoreDimensions` rubric strip (Home).
 *
 * Responsive at every width (no desktop-only gate): mobile stacks the
 * copyright above a two-column link grid; ≥900px it's a single row with the
 * columns pulled to the right. `showAbout` adds the "About" column (the
 * Delivery Playground link) — signed-in surfaces only, since that page
 * requires calibration consent.
 */

import { Link } from 'react-router';

import { LEGAL_LINKS } from '../lib/legalLinks';

const ABOUT_LINKS = [
  { to: '/delivery-playground', label: 'Delivery Playground' },
] as const;

type FooterLink = { to: string; label: string };

function FooterLinkColumn({
  heading,
  links,
}: {
  heading: string;
  links: readonly FooterLink[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text">
        {heading}
      </p>
      <nav
        aria-label={heading}
        className="flex flex-col gap-2 text-sm text-text-muted"
      >
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="rounded-xs transition-colors hover:text-text focus-visible:text-text focus-visible:outline-none"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

type Props = { showAbout?: boolean };

export default function SiteFooter({ showAbout = false }: Props) {
  return (
    <footer className="flex flex-col gap-6 border-t border-border px-8 md:px-16 py-7 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
      <p className="text-sm text-text-muted">InterviewPie © 2026</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 min-[900px]:flex min-[900px]:gap-16">
        {showAbout && <FooterLinkColumn heading="About" links={ABOUT_LINKS} />}
        <FooterLinkColumn heading="Legal" links={LEGAL_LINKS} />
      </div>
    </footer>
  );
}
