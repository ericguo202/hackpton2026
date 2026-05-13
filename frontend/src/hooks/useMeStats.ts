/**
 * `useMeStats` — rolling user-level aggregates across completed sessions.
 *
 * Powers the small stats strip on the History page (total sessions, all-time
 * average per dimension, total filler words). Cheap single-row response, so
 * we just fetch on mount with no caching layer.
 */

import { useApiFetch } from './useApiFetch';
import type { MeStats } from '../types/history';

export function useMeStats() {
  const { data, isLoading, error, refetch } = useApiFetch<MeStats>('/api/v1/me/stats');
  return { stats: data, isLoading, error, refetch };
}
