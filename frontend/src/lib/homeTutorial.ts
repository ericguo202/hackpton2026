/**
 * Per-user persistence for the Home first-run tutorial.
 *
 * A single boolean flag — "this user has finished or permanently dismissed the
 * welcome tutorial" — kept in localStorage and NAMESPACED by Clerk user id
 * (mirrors `faceCalibration.ts`) so two people sharing a browser don't suppress
 * each other's tutorial. Device-local on purpose: it's a UI nicety, not a
 * server-demonstrable consent. SSR-safe + swallows quota/disabled-storage
 * errors like the other localStorage helpers.
 */

const STORAGE_PREFIX = 'home_tutorial_dismissed';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function isHomeTutorialDismissed(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return window.localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function dismissHomeTutorial(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), '1');
  } catch {
    // Quota or disabled storage — the tutorial will just re-offer next visit.
  }
}
