/**
 * Signed-out masthead sign-in link — the `rightSlot` counterpart to
 * `AccountButton`. Used by the Hero and by the public pages whose chrome is
 * auth-bivalent (Scoring, Pricing): signed-in gets the app nav + account
 * button, signed-out gets the legal menu + this.
 *
 * The oversized `before:` pseudo-element is a hit-area expander — the link is
 * small type, so it needs a touch target larger than its glyphs.
 */

import { useNavigate } from 'react-router';

export default function SignInLink() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/sign-in')}
      className="relative cursor-pointer rounded-xs text-sm text-text-muted underline decoration-border-strong underline-offset-[6px] transition-colors hover:text-text hover:decoration-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface before:absolute before:-inset-[14px] before:content-['']"
    >
      Sign in
    </button>
  );
}
