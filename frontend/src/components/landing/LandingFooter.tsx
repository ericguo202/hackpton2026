/**
 * Quiet landing footer: brand line and the legal-policy links. Replaces the
 * old ScoreDimensions strip on the signed-out surface; the six dimensions
 * now live in the Methodology section, and the slogan lives beside the hero
 * CTA (the One-Pun Rule: it appears once per page). Visible at every width
 * (the old strip hid below 900px).
 */

import { Link } from 'react-router';

import { LEGAL_LINKS } from '../../lib/legalLinks';

export default function LandingFooter() {
  return (
    <footer className="flex flex-col gap-4 border-t border-border px-8 md:px-16 py-7 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
      <p className="text-sm text-text-muted">InterviewPie © 2026</p>
      <nav
        aria-label="Legal"
        className="flex flex-wrap items-center gap-x-6 gap-y-2 text-eyebrow uppercase tracking-eyebrow text-text-muted"
      >
        {LEGAL_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="rounded-xs transition-colors hover:text-text focus-visible:text-text focus-visible:outline-none"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
