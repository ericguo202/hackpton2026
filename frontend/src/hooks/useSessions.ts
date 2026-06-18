/**
 * `useSessions` — fetches the caller's completed-session history.
 *
 * Lazy by default: hand back a `refetch` so the History page can refresh
 * after navigating from a freshly-finished session without a remount race.
 */

import { useFetch } from './useFetch';
import type { SessionListItem } from '../types/history';

export function useSessions() {
  const { data: sessions, ...rest } =
    useFetch<SessionListItem[]>('/api/v1/sessions');
  return { sessions, ...rest };
}
