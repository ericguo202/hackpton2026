/**
 * FlashBanner — one-shot notice carried via location state.
 *
 * A page that wants to flash the user navigates with a `flash` string in
 * the location state, e.g.
 *
 *   navigate('/', { replace: true, state: { flash: 'Session not found.' } });
 *
 * The banner reads it on mount, captures it into local state, then clears
 * the history entry's state so a refresh doesn't re-show the same flash.
 * Auto-dismisses after a few seconds; the × button dismisses immediately.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

const AUTO_DISMISS_MS = 6000;

export default function FlashBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState<string | null>(
    () => (location.state as { flash?: string } | null)?.flash ?? null,
  );
  const consumedRef = useRef(false);

  // Clear the location state once we've consumed the message so that a
  // refresh (which restores history state) doesn't re-show it.
  useEffect(() => {
    if (consumedRef.current) return;
    if ((location.state as { flash?: string } | null)?.flash) {
      consumedRef.current = true;
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (!flash) return null;

  // Fixed overlay positioned just below the TopBar. The outer wrapper is
  // pointer-events-none so the gutters on either side don't block clicks
  // to the page underneath; the inner banner re-enables pointer events
  // so the dismiss button works.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 px-8 md:px-16">
      <div
        role="status"
        aria-live="polite"
        className="anim-reveal pointer-events-auto mx-auto flex w-full max-w-[80rem] items-start justify-between gap-4 rounded-md border border-border bg-surface-raised px-4 py-3 shadow-[0_8px_24px_-12px_rgba(23,21,15,0.18)]"
      >
        <p className="text-sm leading-[1.55] text-text-muted">
          <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">
            Notice
          </span>
          {flash}
        </p>
        <button
          type="button"
          onClick={() => setFlash(null)}
          aria-label="Dismiss notice"
          className="-mr-1 cursor-pointer rounded-sm px-2 py-0.5 text-text-subtle transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          ×
        </button>
      </div>
    </div>
  );
}
