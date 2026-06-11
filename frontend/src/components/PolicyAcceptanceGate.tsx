/**
 * Forced policy-acceptance gate.
 *
 * Mounted once at the app root next to `BetaFeedbackGate`. On every authenticated
 * route it checks the user's stored Terms/Privacy acceptance versions against the
 * current ones; if either is behind (a brand-new account, an OAuth-via-Sign-In
 * account, or any user after a policy bump), it renders the un-dismissable
 * `PolicyAcceptanceDialog`. The only way out is agreeing (or the decline path
 * inside the dialog: export / delete / sign out).
 *
 * The check is server-state-driven (`useMe`), so a refresh re-evaluates it and
 * there's no client-only flag to dodge. `/practice` is excluded so an in-progress
 * interview is never interrupted, and `/legal/*` is excluded so the policy links
 * inside the modal (which open in a new tab where this gate is also mounted) stay
 * readable — the user is re-prompted the moment they navigate elsewhere, mirroring
 * `BetaFeedbackGate`.
 */

import { useState } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation } from 'react-router';

import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { needsPolicyAcceptance, recordPolicyAcceptance, whatChanged } from '../lib/policyAcceptance';
import PolicyAcceptanceDialog from './PolicyAcceptanceDialog';

export default function PolicyAcceptanceGate() {
  const { pathname } = useLocation();
  const { isSignedIn } = useAuth();
  const { apiFetch, isReady } = useApi();
  const { me, refetch } = useMe();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active =
    Boolean(isSignedIn) &&
    isReady &&
    pathname !== '/practice' &&
    // The acceptance links open the policy pages (in a new tab, where this gate
    // is also mounted). Never block a /legal/* route, or the modal would cover
    // the very policy the user opened it to read.
    !pathname.startsWith('/legal') &&
    needsPolicyAcceptance(me);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      await recordPolicyAcceptance(apiFetch);
      await refetch();
    } catch (err) {
      // A 409 means the version moved under us (a fresh bump) — refetch so the
      // dialog re-renders with the newly-changed document and the user re-agrees.
      if (err instanceof ApiError && err.status === 409) {
        await refetch();
        setError('The terms changed. Please review and agree again.');
        return;
      }
      setError(
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : 'Could not save your acceptance. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!active || !me) return null;

  return (
    <PolicyAcceptanceDialog
      open
      changed={whatChanged(me)}
      submitting={submitting}
      error={error}
      onAccept={handleAccept}
    />
  );
}
