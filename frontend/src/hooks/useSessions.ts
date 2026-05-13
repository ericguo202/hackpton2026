/**
 * `useSessions` — fetches the caller's completed-session history.
 *
 * Lazy by default: hand back a `refetch` so the History page can refresh
 * after navigating from a freshly-finished session without a remount race.
 */

import { useApiFetch } from './useApiFetch';
import type { SessionListItem } from '../types/history';

export function useSessions() {
  const { data, isLoading, error, refetch, isReady } =
    useApiFetch<SessionListItem[]>('/api/v1/sessions');
  return { sessions: data, isLoading, error, refetch, isReady };
}
