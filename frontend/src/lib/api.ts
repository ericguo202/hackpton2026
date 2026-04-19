/**
 * API base URL + shared error class.
 *
 * The authenticated fetcher lives in `hooks/useApi.ts` because `getToken()`
 * from Clerk must be called inside React context. This file stays
 * context-free so it can be imported from anywhere (tests, unauth code).
 */

export const BASE_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export function buildUrl(path: string): string {
  // Accept both "/api/v1/me" and "api/v1/me". Strip trailing slashes on
  // BASE_URL so a misconfigured `VITE_API_URL=http://host/` doesn't produce
  // a `//api/v1/...` path that FastAPI won't match.
  if (path.startsWith('http')) return path;
  const base = BASE_URL.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`${status} ${body}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
