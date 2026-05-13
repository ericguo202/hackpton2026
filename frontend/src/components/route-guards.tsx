/**
 * Route guards for the React Router migration.
 *
 * All three guards wait for Clerk's `isLoaded` AND `useMe`'s `isReady`
 * before deciding so we never flash the wrong page during initial load
 * or session rehydration. Compose via layout routes:
 *
 *   <Route element={<RequireAuth />}>
 *     <Route element={<RequireOnboarded />}>
 *       <Route path="/practice" element={<Practice />} />
 *     </Route>
 *   </Route>
 */

import { Show, useAuth } from '@clerk/react';
import { Navigate, Outlet } from 'react-router';

import { useMe } from '../hooks/useMe';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Loading
      </p>
    </div>
  );
}

/** Redirects signed-out users to /sign-in. */
export function RequireAuth() {
  const { isLoaded } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  return (
    <>
      <Show when="signed-out">
        <Navigate to="/sign-in" replace />
      </Show>
      <Show when="signed-in">
        <Outlet />
      </Show>
    </>
  );
}

/**
 * Assumes RequireAuth ran first. Redirects signed-in-but-not-onboarded
 * users to /onboarding. Onboarded users pass through.
 */
export function RequireOnboarded() {
  const { me, isReady, isLoading } = useMe();
  if (!isReady || isLoading || !me) return <LoadingScreen />;
  if (!me.completed_registration) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/**
 * Redirects already-onboarded users away from /sign-in, /sign-up, and
 * /onboarding. Signed-out users and signed-in-but-not-yet-onboarded
 * users are allowed through.
 */
export function RedirectIfOnboarded() {
  const { isLoaded } = useAuth();
  const { me, isReady, isLoading } = useMe();
  if (!isLoaded || !isReady) return <LoadingScreen />;
  // While signed-in, wait for /me before deciding — otherwise an
  // onboarded user briefly sees /sign-in on a hard refresh.
  return (
    <>
      <Show when="signed-out">
        <Outlet />
      </Show>
      <Show when="signed-in">
        {isLoading || !me ? (
          <LoadingScreen />
        ) : me.completed_registration ? (
          <Navigate to="/" replace />
        ) : (
          <Outlet />
        )}
      </Show>
    </>
  );
}
