/**
 * OAuth callback landing for Clerk's authenticateWithRedirect flow.
 *
 * Mounted by App.tsx when window.location.pathname === '/sso-callback'.
 * Clerk's component completes the OAuth handshake, establishes the
 * session, and redirects to the forceRedirectUrl. After that, App's
 * <Show when="signed-in"> flips to the authenticated shell.
 */

import { AuthenticateWithRedirectCallback } from '@clerk/react';

export default function SsoCallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Signing you in
      </p>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/"
        signUpForceRedirectUrl="/"
      />
    </div>
  );
}
