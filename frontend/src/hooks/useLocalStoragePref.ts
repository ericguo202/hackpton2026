/**
 * Typed `useState` that mirrors itself to `localStorage` under a fixed key.
 *
 * Reads once on mount (SSR-safe: falls back to `defaultValue` when
 * `window` is missing), then writes on every change. Serialization is
 * `JSON.stringify` — keep values to primitives/plain objects.
 *
 * Used for small UI preferences that don't need to round-trip through
 * the backend (e.g. "show question text"). If a preference ever needs
 * to sync across devices, promote it to a column on `users` instead.
 */

import { useEffect, useState } from 'react';

export function useLocalStoragePref<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? defaultValue : (JSON.parse(raw) as T);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota or disabled storage — pref just won't persist this session.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
