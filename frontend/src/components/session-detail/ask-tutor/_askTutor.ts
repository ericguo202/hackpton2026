/**
 * Ask Tutor shared state — open / minimize / snippet-seed for one turn's
 * tutor chat.
 *
 * Mirrors the `_momentFlash.ts` pattern: a tiny context whose value is built
 * by a `useProvide…` hook in the panel and consumed across grid rows (the
 * "Ask about this" deep-link lives in the Improvement Moments card, which sits
 * in a different grid row from the launcher and the floating window).
 *
 * The default context value is `null`, so a card that calls `useAskTutor()`
 * WITHOUT a provider (e.g. Practice Results, which reuses the same inner cards
 * but does not mount the tutor) simply gets `null` and renders no tutor UI.
 * That null-gate is how the feature stays scoped to SessionDetail.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type AskTutorStatus = 'closed' | 'open' | 'minimized';

/** A deep-linked snippet plus a monotonic nonce, so the chat can tell a fresh
 *  "Ask about this" click from a stale value — even when the same snippet is
 *  clicked twice in a row (same text, new nonce → re-seeds). */
export interface PendingSnippet {
  snippet: string;
  nonce: number;
}

export interface AskTutorApi {
  status: AskTutorStatus;
  /** Set by an "Ask about this" deep-link; the chat reads it during render to
   *  seed a referenced-context chip. Survives until the chat closes. */
  pendingSnippet: PendingSnippet | null;
  open: () => void;
  /** Open (or surface) the chat with a transcript snippet attached as context. */
  openAbout: (snippet: string) => void;
  minimize: () => void;
  restore: () => void;
  close: () => void;
}

export const AskTutorContext = createContext<AskTutorApi | null>(null);

/** Consumer hook. Returns `null` when no provider is mounted above. */
export function useAskTutor(): AskTutorApi | null {
  return useContext(AskTutorContext);
}

/** Builds the provider value. Call once per turn panel. */
export function useProvideAskTutor(): AskTutorApi {
  const [status, setStatus] = useState<AskTutorStatus>('closed');
  const [pendingSnippet, setPendingSnippet] = useState<PendingSnippet | null>(null);
  const nonceRef = useRef(0);

  const open = useCallback(() => setStatus('open'), []);
  const minimize = useCallback(() => setStatus('minimized'), []);
  const restore = useCallback(() => setStatus('open'), []);
  const close = useCallback(() => {
    setStatus('closed');
    setPendingSnippet(null);
  }, []);
  const openAbout = useCallback((snippet: string) => {
    nonceRef.current += 1;
    setPendingSnippet({ snippet, nonce: nonceRef.current });
    setStatus('open');
  }, []);

  return useMemo(
    () => ({ status, pendingSnippet, open, openAbout, minimize, restore, close }),
    [status, pendingSnippet, open, openAbout, minimize, restore, close],
  );
}
