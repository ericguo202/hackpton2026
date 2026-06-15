/**
 * In-memory store for the most recent practice session's per-turn replay
 * media (recorded answer video/audio).
 *
 * Recorded audio/video is never persisted server-side — it lives only as
 * in-browser `blob:` object URLs. When the final turn is submitted, Practice
 * redirects to `/sessions/:id?from=practice`; this module-level store carries
 * the replay URLs across that client-side navigation (object URLs are tied to
 * the document, not the React component, so they survive the route change once
 * the holding state moves here instead of being revoked on Practice unmount).
 *
 * Module-level state, no provider — mirrors the `useMe.ts` pattern. Only ONE
 * session is retained at a time: appending replays for a new session revokes
 * the previous session's URLs (the memory bound). On a hard reload the blobs
 * are gone entirely and SessionDetail degrades to the plain server view.
 */

export type TurnReplay = {
  replayUrl: string | null;
  audioReplayUrl: string | null;
};

let currentSessionId: string | null = null;
let replays: TurnReplay[] = [];

function revokeAll() {
  for (const r of replays) {
    if (r.replayUrl) URL.revokeObjectURL(r.replayUrl);
    if (r.audioReplayUrl) URL.revokeObjectURL(r.audioReplayUrl);
  }
}

/**
 * Record one turn's replay URLs for `sessionId`. Switching to a new session
 * first revokes and drops the previous session's URLs so memory stays bounded
 * to a single session's worth of blobs.
 */
export function appendPracticeReplay(sessionId: string, turn: TurnReplay) {
  if (currentSessionId !== sessionId) {
    revokeAll();
    currentSessionId = sessionId;
    replays = [];
  }
  replays = [...replays, turn];
}

/**
 * Replays captured for `sessionId`, in turn order. Empty when the store holds
 * a different session (or nothing) — e.g. after a hard reload, or when the
 * session is opened from History rather than the post-practice redirect.
 */
export function getPracticeReplays(sessionId: string): TurnReplay[] {
  return currentSessionId === sessionId ? replays : [];
}

/**
 * Revoke and drop the held replays. With no argument, clears unconditionally
 * (used when abandoning a session). With a `sessionId`, clears only if it
 * matches the held session.
 */
export function clearPracticeReplays(sessionId?: string) {
  if (sessionId != null && sessionId !== currentSessionId) return;
  revokeAll();
  replays = [];
  currentSessionId = null;
}
