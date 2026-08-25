/**
 * Site footer — brand/copyright on the left, grouped link columns on the
 * right. Shared by the signed-out Hero and the signed-in Home; replaces the
 * old `LandingFooter` (Hero) and `ScoreDimensions` rubric strip (Home).
 *
 * Responsive at every width (no desktop-only gate): mobile stacks the
 * copyright above a two-column link grid; ≥900px it's a single row with the
 * columns pulled to the right.
 *
 * The "About" column is shown on BOTH surfaces: Scoring and Pricing are public
 * pages, and a signed-out visitor weighing our methodology or wondering what
 * "free" actually means is exactly who needs them. `signedIn` only adds the
 * Delivery Playground link — that page is auth-gated (it re-derives a score
 * from your own calibration), so linking it signed-out would just bounce to
 * /sign-in.
 */

import { Link } from 'react-router';

import { LEGAL_LINKS } from '../lib/legalLinks';

const PRICING_LINK = { to: '/pricing', label: 'Pricing' } as const;
const SCORING_LINK = { to: '/scoring', label: 'Scoring' } as const;
const DELIVERY_PLAYGROUND_LINK = {
  to: '/delivery-playground',
  label: 'Delivery Playground',
} as const;

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

type Props = { signedIn?: boolean };

export default function SiteFooter({ signedIn = false }: Props) {
  const aboutLinks: FooterLink[] = signedIn
    ? [PRICING_LINK, SCORING_LINK, DELIVERY_PLAYGROUND_LINK]
    : [PRICING_LINK, SCORING_LINK];

  return (
    <footer className="flex flex-col gap-6 border-t border-border px-8 md:px-16 py-7 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
      <p className="text-sm text-text-muted">InterviewPie © 2026</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 min-[900px]:flex min-[900px]:gap-16">
        <FooterLinkColumn heading="About" links={aboutLinks} />
        <FooterLinkColumn heading="Legal" links={LEGAL_LINKS} />
      </div>
    </footer>
  );
}
