/**
 * Theme store for the light/dark toggle.
 *
 * The real source of truth is the `dark` class on <html>, which is set BEFORE
 * React mounts by the inline script in index.html (OS default, localStorage
 * wins). This module reads that class as its snapshot so there's no flash on
 * hydrate, and `setTheme` keeps the class + localStorage + any subscribers in
 * sync. Backed by useSyncExternalStore so multiple consumers (today just the
 * TopBar toggle) never drift.
 */

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'theme';

export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();

function snapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage can throw (private mode / blocked); the class still applied.
  }
  listeners.forEach((l) => l());
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light' as Theme);
  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);
  return { theme, toggle };
}
