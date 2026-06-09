/**
 * Forced beta-feedback gate.
 *
 * Mounted once at the app root. On each of the four main authenticated routes
 * it asks the backend whether the caller still owes beta feedback (3+ lifetime
 * completed sessions, no `session_feedback` row yet). If so it renders the
 * un-dismissable `BetaFeedbackDialog` — the only way out is submitting.
 *
 * The trigger is evaluated server-side on every navigation, so a refresh
 * re-triggers it and there's no client-only flag to dodge. `/practice` is
 * deliberately excluded so an in-progress interview is never interrupted.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation } from 'react-router';

import { useApi } from '../hooks/useApi';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import type {
  FeedbackRequiredResponse,
  SessionFeedbackPayload,
  SessionFeedbackResponse,
} from '../types/sessionFeedback';
import BetaFeedbackDialog from './BetaFeedbackDialog';

// Routes that force the modal once feedback is due. Deliberately excludes
// /practice (and every other route) so the survey never interrupts an active
// session — testers get re-prompted the moment they navigate here instead.
const ELIGIBLE_ROUTES = ['/', '/history', '/personalize', '/calibrate'];

export default function BetaFeedbackGate() {
  const { pathname } = useLocation();
  const { isSignedIn } = useAuth();
  const { apiFetch, isReady } = useApi();

  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = Boolean(isSignedIn) && isReady && ELIGIBLE_ROUTES.includes(pathname);

  // Re-check on every eligible-route entry. Fails open: any error clears the
  // gate so a flaky /required call never traps the user behind a modal. The
  // ineligible case is handled by the render guard below (not a synchronous
  // setState here) so we don't trip react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<FeedbackRequiredResponse>(
          '/api/v1/session-feedback/required',
        );
        if (!cancelled) {
          setPendingSessionId(res.required ? res.session_id : null);
        }
      } catch {
        if (!cancelled) setPendingSessionId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, eligible, apiFetch]);

  async function handleSubmit(payload: SessionFeedbackPayload) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<SessionFeedbackResponse>('/api/v1/session-feedback', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setPendingSessionId(null);
    } catch (err) {
      // A 409 means feedback already landed (e.g. a duplicate submit) — treat
      // it as success and close, matching the create endpoint's idempotency.
      if (err instanceof ApiError && err.status === 409) {
        setPendingSessionId(null);
        return;
      }
      setError(
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : err instanceof Error
            ? err.message
            : 'Could not submit feedback. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Gate on `eligible` too so a stale pending id from a prior route never
  // surfaces the modal on an excluded route (e.g. /practice).
  if (!eligible || !pendingSessionId) return null;

  return (
    <BetaFeedbackDialog
      open
      sessionId={pendingSessionId}
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    />
  );
}
