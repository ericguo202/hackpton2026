/**
 * Voluntary beta-feedback launcher.
 *
 * A round, support-chat-style floating button (bottom-right) that lets a
 * signed-in, onboarded tester open the same `BetaFeedbackDialog` on demand —
 * dismissable, and submittable repeatedly so we can track sentiment over time.
 * Voluntary submissions carry no session id (`session_id: null`), so they
 * accumulate as standalone rows; the compulsory `BetaFeedbackGate` is separate.
 *
 * Hidden on `/practice` and `/calibrate`, where it would cover important UI.
 */

import { useCallback, useState } from 'react';
import { useAuth } from '@clerk/react';
import { MessageCircle } from 'lucide-react';
import { useLocation } from 'react-router';

import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import type {
  SessionFeedbackPayload,
  SessionFeedbackResponse,
} from '../types/sessionFeedback';
import BetaFeedbackDialog from './BetaFeedbackDialog';

// Routes where the launcher would hide important UI (full-viewport interview /
// camera box). Everywhere else is fine for an onboarded, signed-in user.
const EXCLUDED_ROUTES = ['/practice', '/calibrate'];

export default function BetaFeedbackLauncher() {
  const { pathname } = useLocation();
  const { isSignedIn } = useAuth();
  const { me, isReady } = useMe();
  const { apiFetch } = useApi();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Mirrors BetaFeedbackGate's POST + 409-as-success handling: a 409 means the
  // feedback already landed, so treat it as a successful close.
  const handleSubmit = useCallback(
    async (payload: SessionFeedbackPayload) => {
      setSubmitting(true);
      setError(null);
      try {
        await apiFetch<SessionFeedbackResponse>('/api/v1/session-feedback', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setOpen(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setOpen(false);
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
    },
    [apiFetch],
  );

  const visible =
    Boolean(isSignedIn)
    && isReady
    && me?.completed_registration === true
    && !EXCLUDED_ROUTES.includes(pathname);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Submit Feedback"
        aria-label="Submit Feedback"
        className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Conditionally mounted so each open starts with a fresh form. */}
      {open && (
        <BetaFeedbackDialog
          open
          sessionId={null}
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
          onClose={close}
        />
      )}
    </>
  );
}
