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
      // 204 No Content (DELETE endpoints) / any empty body has nothing to
      // parse — return undefined instead of letting res.json() throw on the
      // empty string (which would skip a caller's post-mutation refetch).
      if (res.status === 204) {
        return undefined as T;
      }
      return res.json() as Promise<T>;
    },
    [getToken, isSignedIn],
  );

  // Same auth + error contract as `apiFetch`, but returns the raw `Response`
  // instead of parsing JSON — for streaming endpoints (SSE) where the caller
  // reads `res.body`. On a non-2xx the error body is read and thrown as an
  // `ApiError` (so e.g. a 422 moderation block surfaces its `detail`).
  const apiStream = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      if (!isSignedIn) {
        throw new ApiError(401, 'not signed in');
      }
      const token = await getToken();
      if (!token) {
        throw new ApiError(401, 'no session token');
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      };
      const res = await fetch(buildUrl(path), { ...init, headers });
      if (!res.ok) {
        throw new ApiError(res.status, await res.text());
      }
      return res;
    },
    [getToken, isSignedIn],
  );

  return { apiFetch, apiStream, isReady: isLoaded };
}
