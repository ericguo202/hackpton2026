/**
 * `useApi` — authenticated fetch wrapper.
 *
 * Reads the Clerk session token via `useAuth().getToken()` and attaches it
 * as `Authorization: Bearer <token>` to every request. Components call
 * `const { apiFetch, isReady } = useApi()` and gate requests on `isReady`
 * so we don't fire before Clerk has rehydrated its session on first mount.
 */

import { useCallback } from 'react';
import { useAuth } from '@clerk/react';

import { ApiError, buildUrl } from '../lib/api';

export function useApi() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  const apiFetch = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      if (!isSignedIn) {
        throw new ApiError(401, 'not signed in');
      }
      const token = await getToken();
      if (!token) {
        // Clerk returns null if the session isn't ready yet — treat as 401.
        throw new ApiError(401, 'no session token');
      }

      // Let the browser set Content-Type (with the multipart boundary) when
      // the caller passes FormData. Forcing application/json here would
      // produce a malformed request that the server can't parse.
      const isFormData = init?.body instanceof FormData;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers as Record<string, string> | undefined),
      };

      const res = await fetch(buildUrl(path), { ...init, headers });

      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }
      return res.json() as Promise<T>;
    },
    [getToken, isSignedIn],
  );

  return { apiFetch, isReady: isLoaded };
}
