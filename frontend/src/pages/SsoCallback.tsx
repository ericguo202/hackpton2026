/**
 * OAuth callback landing for Clerk's authenticateWithRedirect flow.
 *
 * Mounted by App.tsx at /sso-callback. We drive the handshake manually with
 * `clerk.handleRedirectCallback` (the same method the
 * <AuthenticateWithRedirectCallback> control component calls under the hood)
 * so we can CATCH a rejection instead of hanging on "Signing you in".
 *
 * The rejection we care about: the Clerk Allowlist restriction (our beta
 * gate). A non-allowlisted Google sign-up is blocked at Clerk with error code
 * `not_allowed_access` — no account, no session. Both entry points funnel
 * here: "Continue with Google" on /sign-up, and the same button on /sign-in
 * (a new Google identity transfers sign-in → sign-up, which is what's blocked).
 *
 * Happy path is unchanged: on success Clerk navigates to "/" for both sign-in
 * and sign-up, then App's signed-in shell takes over.
 */

import { useClerk } from '@clerk/react';
import { isClerkAPIResponseError } from '@clerk/react/errors';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '../components/ui/button';

type CallbackState = 'pending' | 'restricted' | 'error';

/**
 * Does this rejection reason represent the Allowlist beta-gate block
 * (`not_allowed_access`)? Checks the structured Clerk code first, then falls
 * back to the human message ("<email> is not allowed to access this
 * application") since the sign-in→sign-up transfer surfaces a less-structured
 * reason on the unhandledrejection path.
 */
function looksBlocked(reason: unknown): boolean {
  if (isClerkAPIResponseError(reason) && reason.errors[0]?.code === 'not_allowed_access') {
    return true;
  }
  const message =
    (reason as { message?: string } | null | undefined)?.message ?? String(reason);
  return message.toLowerCase().includes('not allowed to access');
}

export default function SsoCallback() {
  const clerk = useClerk();
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>('pending');
  const ranRef = useRef(false);

  useEffect(() => {
    // A Google SIGN-IN by a user with no account auto-transfers to sign-up
    // (Clerk's `transferable` default). When the Allowlist beta gate blocks
    // that transfer, the 403 rejects INSIDE Clerk's transfer mutation and does
    // NOT surface on the promise we await below — it escapes as an
    // `unhandledrejection`, leaving the page stuck on "Signing you in". Listen
    // for it, recognize the allowlist block, suppress the console noise, and
    // show the restricted card. (We keep `transferable` on so a legit
    // allowlisted first-time Google user still signs in smoothly.)
    const onUnhandled = (event: PromiseRejectionEvent) => {
      if (looksBlocked(event.reason)) {
        event.preventDefault();
        setState('restricted');
      }
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    // React 19 StrictMode double-invokes effects in dev. The OAuth callback
    // must run exactly once — a second call has no ticket left to exchange and
    // would throw spuriously. Guard with a ref, not the deps array.
    if (!ranRef.current) {
      ranRef.current = true;
      clerk
        .handleRedirectCallback(
          {
            // Preserve the prior <AuthenticateWithRedirectCallback> behavior:
            // both sign-in and sign-up land on the app root once the session is
            // established.
            signInForceRedirectUrl: '/',
            signUpForceRedirectUrl: '/',
            // Where our custom auth pages live, so an INCOMPLETE flow (e.g. a
            // sign-up blocked by the Allowlist beta gate) routes back to our own
            // pages instead of Clerk's hosted Account Portal. The blocked-OAuth
            // error is then read off the SignUp resource on /sign-up. Mirrors
            // the ClerkProvider-level signInUrl/signUpUrl; set here too so the
            // callback is self-sufficient.
            signInUrl: '/sign-in',
            signUpUrl: '/sign-up',
            continueSignUpUrl: '/sign-up',
          },
          // Route Clerk's internal navigation through react-router rather than
          // a hard location change.
          (to) => {
            navigate(to);
            return Promise.resolve();
          },
        )
        .catch((err: unknown) => {
          // Log the raw error so the first real OAuth test can confirm the
          // exact code/shape Clerk returns on a restriction.
          console.error('OAuth callback failed:', err);
          setState(looksBlocked(err) ? 'restricted' : 'error');
        });
    }

    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, [clerk, navigate]);

  if (state === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Signing you in
        </p>
      </div>
    );
  }

  const isRestricted = state === 'restricted';

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-8">
      <div className="w-full max-w-md flex flex-col gap-5 text-center">
        <h1 className="font-display font-semibold tracking-[-0.02em] leading-tight text-text text-3xl md:text-4xl">
          {isRestricted ? 'Access not available yet' : 'Something went wrong'}
        </h1>
        <p className="text-text-muted leading-[1.55]">
          {isRestricted
            ? "Access currently restricted to beta testers."
            : "We couldn't finish signing you in. Try again, or use email and password."}
        </p>
        <Button
          type="button"
          size="lg"
          onClick={() => navigate('/sign-in', { replace: true })}
          className="w-full"
        >
          Back to sign in
        </Button>
      </div>
    </div>
  );
}
