/**
 * `useMeStats` — rolling user-level aggregates across completed sessions.
 *
 * Powers the small stats strip + the strengths radar on the History page
 * (total sessions, all-time average per dimension, total filler words, and the
 * per-category rollup). Cheap single-row response, so we just fetch on mount
 * with no caching layer.
 *
 * The optional `filter` narrows the aggregates. `company` / `jobTitle` narrow
 * to one company or role (case-insensitive, server-side). `questionCategory`
 * narrows the tiles + filler stats to pure single-category sessions of that
 * type (the `by_category` rollup always spans every category regardless). The
 * History page passes its combined Company/Role + Question-category filter so
 * a single response honors both. The path changes when the filter changes, so
 * `useFetch` re-keys and refetches; no filter → the all-time path.
 */

import { useFetch } from './useFetch';
import type { MeStats } from '../types/history';

export type MeStatsFilter = {
  company?: string;
  jobTitle?: string;
  questionCategory?: string;
};

function buildStatsPath(filter?: MeStatsFilter): string {
  const params = new URLSearchParams();
  if (filter?.company) params.set('company', filter.company);
  if (filter?.jobTitle) params.set('job_title', filter.jobTitle);
  if (filter?.questionCategory) params.set('question_category', filter.questionCategory);
  const qs = params.toString();
  return qs ? `/api/v1/me/stats?${qs}` : '/api/v1/me/stats';
}

export function useMeStats(filter?: MeStatsFilter) {
  const { data: stats, ...rest } = useFetch<MeStats>(buildStatsPath(filter));
  return { stats, ...rest };
}
