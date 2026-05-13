/**
 * `useSessionDetail` — fetches one session's full payload (session + turns).
 *
 * Refetches when `sessionId` changes so the detail page can render multiple
 * sessions without a remount. Null id is a no-op so the page can mount
 * before the user has selected a session.
 */

import { useApiFetch } from './useApiFetch';
import type { SessionDetail } from '../types/history';

export function useSessionDetail(sessionId: string | null) {
  const path = sessionId ? `/api/v1/sessions/${sessionId}` : null;
  const { data, isLoading, error, refetch } = useApiFetch<SessionDetail>(path);
  return { session: data, isLoading, error, refetch };
}
