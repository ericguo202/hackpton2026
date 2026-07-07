/**
 * `lazyWithRetry` — a hardened `React.lazy` for route chunks.
 *
 * Each page is code-split into its own hashed chunk that the browser fetches on
 * first navigation. That fetch can fail two ways:
 *   1. A transient network blip (common on mobile Safari / flaky cellular).
 *   2. A stale chunk filename — after a new deploy the old hashed file is gone
 *      and 404s for anyone whose tab still holds the previous build's index.
 *
 * Unwrapped, a rejected `import()` throws through `React.lazy` with no error
 * boundary above it, unmounting the whole app to a blank white screen. This
 * wrapper instead: retries the import once (absorbs case 1), then forces a
 * single full-page reload (fixes case 2 — the reload re-fetches index.html and
 * its new chunk map). A per-chunk sessionStorage flag guarantees we reload at
 * most once, so a genuinely broken deploy can't trap the user in a reload loop;
 * that terminal case falls through to `RouteErrorBoundary`.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const FLAG_PREFIX = 'chunk-reload:';

// If sessionStorage is unavailable (locked-down privacy mode), report "already
// reloaded" so we never trigger a reload whose loop we can't guard against.
function alreadyReloaded(flag: string): boolean {
  try {
    return sessionStorage.getItem(flag) === '1';
  } catch {
    return true;
  }
}

function markReloaded(flag: string): void {
  try {
    sessionStorage.setItem(flag, '1');
  } catch {
    /* storage unavailable — alreadyReloaded() already returned true */
  }
}

function clearReloaded(flag: string): void {
  try {
    sessionStorage.removeItem(flag);
  } catch {
    /* ignore */
  }
}

export function lazyWithRetry<T extends ComponentType<any>>( // eslint-disable-line @typescript-eslint/no-explicit-any
  factory: () => Promise<{ default: T }>,
  chunkKey: string,
): LazyExoticComponent<T> {
  const flag = FLAG_PREFIX + chunkKey;
  return lazy(async () => {
    try {
      const mod = await factory();
      clearReloaded(flag); // healthy load — re-arm for a future deploy
      return mod;
    } catch {
      // One silent retry after a short delay for transient failures.
      try {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const mod = await factory();
        clearReloaded(flag);
        return mod;
      } catch (err) {
        if (!alreadyReloaded(flag)) {
          markReloaded(flag);
          window.location.reload();
          // Hold the Suspense fallback until the reload navigates away — this
          // never resolves, so nothing else renders in the meantime.
          return new Promise<{ default: T }>(() => {});
        }
        throw err; // already reloaded this session → let RouteErrorBoundary show.
      }
    }
  });
}
