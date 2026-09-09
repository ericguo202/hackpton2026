/**
 * `useMe` — single source of truth for the signed-in user row.
 *
 * `App.tsx` uses it to gate onboarding vs. dashboard. The OnboardingForm
 * calls `refetch()` after submit so the gate flips without a page reload.
 * MePing also consumes it so we don't double-fetch /me.
 *
 * Each call keeps its own `me`/`isLoading`/`error` state, but a successful
 * fetch is BROADCAST to every other live instance so they share the latest
 * row. This matters for the permanently-mounted app-root siblings that depend
 * on each other's refetches: e.g. `PolicyAcceptanceGate` refetches after the
 * user accepts a policy bump, and `AnalyticsConsentBanner` (a separate
 * instance) must see the new acceptance version to un-hide itself. Without the
 * broadcast, the banner would keep its stale `me` and only reappear after a
 * fresh mount (sign out → sign in / reload). `isLoading`/`error` stay local on
 * purpose, so one component's refetch never flashes another's loading UI.
 */

import { useCallback, useEffect, useState } from 'react';

import { useApi } from './useApi';
import type { MeResponse } from '../types/user';

// Live `setMe` setters across all mounted `useMe` instances. A successful fetch
// pushes the fresh row to every subscriber so independent consumers stay in
// sync without a shared context provider.
const meSubscribers = new Set<(me: MeResponse | null) => void>();

function broadcastMe(me: MeResponse | null) {
  meSubscribers.forEach((notify) => notify(me));
}

export function useMe() {
  const { apiFetch, isReady } = useApi();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe this instance's setter so other instances' refetches reach it.
  // `setMe` is stable across renders, so this runs once per mount.
  useEffect(() => {
    meSubscribers.add(setMe);
    return () => {
      meSubscribers.delete(setMe);
    };
  }, []);

  const fetchMe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Browser-local IANA timezone. The backend SEEDS `users.timezone` from
      // this the first time it sees one and never overwrites it, so the
      // free-tier counters roll on the user's local midnight rather than UTC's.
      // `/me` carries it because it's the first authenticated call on every page
      // load: POST /sessions sends the timezone too, but a user who only ever
      // opens Ask Tutor never reaches that path and would keep rolling on UTC.
      // Omitted rather than sent empty where the runtime can't resolve one.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data = await apiFetch<MeResponse>(
        tz ? `/api/v1/me?timezone=${encodeURIComponent(tz)}` : '/api/v1/me',
      );
      // Update every live instance, not just this one.
      broadcastMe(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  // Fetch-on-mount once Clerk is ready. `fetchMe` flips loading/error state
  // synchronously before its first await, which the set-state-in-effect rule
  // flags — but this is the canonical "load data on mount" effect, not a
  // prop-derived state sync, so the synchronous writes are intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isReady) void fetchMe();
  }, [isReady, fetchMe]);

  return { me, isLoading, error, refetch: fetchMe, isReady };
}
