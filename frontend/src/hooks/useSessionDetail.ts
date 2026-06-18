/**
 * `useSessionDetail` — fetches one session's full payload (session + turns).
 *
 * Refetches when `sessionId` changes so the detail page can render multiple
 * sessions without a remount. Null id is a no-op so the page can mount
 * before the user has selected a session.
 *
 * Evaluation finalizes in a background task (see backend
 * `_run_background_finalize`), so a session can be fetched while it's still
 * `in_progress` with null scores. `usePolledResource` silently polls every ~2s
 * until the session reaches a terminal status, so SessionDetail self-heals from
 * "Scoring in progress" to real scores without a manual refresh — mirroring
 * Practice's Results polling. The poll's `GET` also drives the backend lazy
 * reaper, so opening a stuck session actively completes it.
 */

import { usePolledResource } from './usePolledResource';
import type { SessionDetail } from '../types/history';

export function useSessionDetail(sessionId: string | null) {
  const { data: session, ...rest } = usePolledResource<SessionDetail>(
    sessionId ? `/api/v1/sessions/${sessionId}` : null,
    (s) => s.status === 'in_progress' || s.status === 'pending',
  );
  return { session, ...rest };
}
