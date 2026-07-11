/**
 * `useMeStats` — rolling user-level aggregates across completed sessions.
 *
 * Powers the small stats strip on the History page (total sessions, all-time
 * average per dimension, total filler words). Cheap single-row response, so
 * we just fetch on mount with no caching layer.
 *
 * An optional `filter` narrows every aggregate to one company or one role
 * (case-insensitive, server-side) — the History page passes its active
 * Company/Role filter so the summary tiles and the "Most used filler words"
 * bar reflect it. The path changes when the filter changes, so `useFetch`
 * re-keys and refetches; no filter → the original all-time path.
 */

import { useFetch } from './useFetch';
import type { MeStats } from '../types/history';

export type MeStatsFilter = { field: 'company' | 'job_title'; value: string };

export function useMeStats(filter?: MeStatsFilter) {
  const path =
    filter && filter.value
      ? `/api/v1/me/stats?${filter.field}=${encodeURIComponent(filter.value)}`
      : '/api/v1/me/stats';
  const { data: stats, ...rest } = useFetch<MeStats>(path);
  return { stats, ...rest };
}
