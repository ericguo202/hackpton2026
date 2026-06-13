/**
 * Forced policy-acceptance modal.
 *
 * Rendered by `PolicyAcceptanceGate` whenever the signed-in user's stored Terms
 * or Privacy version is behind the current one (first acceptance OR a material
 * update). It is **un-dismissable** — no backdrop close, no X, Escape swallowed,
 * back-button + unload trapped — mirroring the locked path of
 * `BetaFeedbackDialog`. The only ways forward are agreeing or the decline path.
 *
 * Decline path (user-confirmed legal posture): the user can't continue under the
 * updated terms, but is never trapped — they may export their data (GDPR/UK
 * access right), delete their account (right to erasure → the Clerk
 * `user.deleted` webhook cascade), or simply sign out.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useClerk } from '@clerk/react';

import { useApi } from '../hooks/useApi';
import { Button } from './ui/button';

type Props = {
  open: boolean;
  // Which documents the user still owes acceptance for (drives the copy).
  changed: { terms: boolean; privacy: boolean };
  submitting: boolean;
  error: string | null;
  onAccept: () => void;
};

function headingFor(changed: { terms: boolean; privacy: boolean }): string {
  // Both flagged on first acceptance (no prior record) — frame as a review, not
  // an update. A single flag means that one document materially changed.
  if (changed.terms && changed.privacy) {
    return 'Review our Terms of Service & Privacy Policy';
  }
  if (changed.terms) return 'We’ve updated our Terms of Service';
  return 'We’ve updated our Privacy Policy';
}

export default function PolicyAcceptanceDialog({
  open,
  changed,
  submitting,
  error,
  onAccept,
}: Props) {
  const clerk = useClerk();
  const { apiFetch } = useApi();
  const formRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<'accept' | 'decline'>('accept');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<null | 'export' | 'delete' | 'signout'>(null);
  const [declineError, setDeclineError] = useState<string | null>(null);

  // Locked modal: swallow Escape, trap back-button + unload, keep focus inside.
  // Same mechanism as BetaFeedbackDialog's compulsory path.
  useEffect(() => {
    if (!open) return;

    const focusFirst = () => {
      formRef.current
        ?.querySelector<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Tab' || !formRef.current) return;
      const focusable = Array.from(
        formRef.current.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    focusFirst();
    window.addEventListener('keydown', onKeyDown);
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [open]);

  async function handleExport() {
    setBusy('export');
    setDeclineError(null);
    try {
      const bundle = await apiFetch<unknown>('/api/v1/me/export');
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDeclineError('Could not export your data. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy('delete');
    setDeclineError(null);
    try {
      // Deletes the Clerk user → fires the `user.deleted` webhook, which cascades
      // the local row + all sessions/turns/metrics/saved questions.
      await clerk.user?.delete();
      await clerk.signOut({ redirectUrl: '/' });
    } catch {
      setDeclineError('Could not delete your account. Try again.');
      setBusy(null);
    }
  }

  async function handleSignOut() {
    setBusy('signout');
    setDeclineError(null);
    try {
      await clerk.signOut({ redirectUrl: '/' });
    } catch {
      setDeclineError('Could not sign out. Try again.');
      setBusy(null);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-acceptance-title"
      className="anim-crossfade fixed inset-0 z-[80] flex items-center justify-center bg-text/55 p-4 backdrop-blur-sm"
    >
      <div
        ref={formRef}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface-raised"
      >
        <div className="border-b border-border px-6 py-5">
          <p className="text-sm font-medium text-text-muted">
            {view === 'accept' ? 'Action required' : 'Before you go'}
          </p>
          <h2
            id="policy-acceptance-title"
            className="mt-2 font-display text-2xl text-text"
          >
            {view === 'accept' ? headingFor(changed) : 'You can’t continue without agreeing'}
          </h2>
        </div>

        {view === 'accept' ? (
          <>
            <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm leading-[1.6] text-text-muted">
              <p>
                To keep using the Service, please review and agree to the latest{' '}
                {changed.terms && (
                  <PolicyLink to="/legal/terms">Terms of Service</PolicyLink>
                )}
                {changed.terms && changed.privacy ? ' and ' : ''}
                {changed.privacy && (
                  <PolicyLink to="/legal/privacy">Privacy Policy</PolicyLink>
                )}
                . They open in a new tab so you don’t lose this page.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer text-text">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-xs border border-border-strong bg-surface-sunken accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                />
                <span>
                  I have read and agree to the latest{' '}
                  {changed.terms ? 'Terms of Service' : ''}
                  {changed.terms && changed.privacy ? ' and ' : ''}
                  {changed.privacy ? 'Privacy Policy' : ''}.
                </span>
              </label>
            </div>

            <div className="border-t border-border bg-surface px-6 py-4">
              {error && (
                <p role="alert" className="mb-3 text-sm text-accent dark:text-cherry-glaze">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={!agreed || submitting}
                  onClick={onAccept}
                  className="w-full"
                >
                  {submitting ? 'Saving…' : 'Agree and continue'}
                </Button>
                <button
                  type="button"
                  onClick={() => setView('decline')}
                  className="mx-auto text-sm text-text-muted underline underline-offset-4 decoration-border-strong transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
                >
                  I don’t agree
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm leading-[1.6] text-text-muted">
              <p>
                That’s okay — you just can’t keep using the Service under the
                updated terms. You’re not locked in: you can export a copy of your
                data or delete your account entirely first.
              </p>
              {declineError && (
                <p role="alert" className="text-sm text-accent dark:text-cherry-glaze">
                  {declineError}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <SecondaryButton
                  onClick={handleExport}
                  disabled={busy !== null}
                  label={busy === 'export' ? 'Preparing…' : 'Export my data'}
                />
                <SecondaryButton
                  onClick={handleDelete}
                  disabled={busy !== null}
                  label={busy === 'delete' ? 'Deleting…' : 'Delete my account'}
                  danger
                />
              </div>
            </div>

            <div className="border-t border-border bg-surface px-6 py-4">
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={busy !== null}
                  onClick={handleSignOut}
                  className="w-full"
                >
                  {busy === 'signout' ? 'Signing out…' : 'Sign out'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setView('accept');
                    setDeclineError(null);
                  }}
                  disabled={busy !== null}
                  className="mx-auto text-sm text-text-muted underline underline-offset-4 decoration-border-strong transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs disabled:opacity-50"
                >
                  ← Back
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PolicyLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noopener noreferrer"
      className="text-text underline underline-offset-4 decoration-border-strong transition-colors hover:decoration-text"
    >
      {children}
    </Link>
  );
}

function SecondaryButton({
  onClick,
  disabled,
  label,
  danger = false,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 ' +
        (danger
          ? 'border-border-strong text-accent hover:bg-surface-sunken dark:text-cherry-glaze'
          : 'border-border-strong text-text hover:bg-surface-sunken')
      }
    >
      {label}
    </button>
  );
}
