/**
 * SaveQuestionButton — save a session's opening question for re-practice.
 *
 * Reused at two mount points (SessionDetail Turn 1, Practice Results Turn 1).
 * Three states:
 *   - Save   — clickable; saves this session as the baseline attempt.
 *   - Saved  — disabled; already saved (or just saved this click).
 *   - Full   — disabled; the user is at the 5/5 cap.
 * Also disables (with a quiet reason) when the opening turn wasn't scored OR
 * the session hasn't finished finalizing — the server requires a *completed*
 * session to save, so this mirrors that gate client-side and avoids a pointless
 * 422 (whose error copy would otherwise render under a still-clickable button).
 *
 * Self-contained: pulls the saved-questions list via `useSavedQuestions` to
 * know the current count (cap) and to fire the save + refetch. Semantic
 * tokens only, so it flips in dark mode for free.
 */

import { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';

import { useSavedQuestions } from '../hooks/useSavedQuestions';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { trackEvent } from '../lib/analytics';

const SAVED_QUESTION_CAP = 5;

type Props = {
  sessionId: string;
  /** From `session.saved_question_id != null` — already saved server-side. */
  alreadySaved: boolean;
  /** Opening turn was evaluated (turn 1 has non-null scores). */
  evaluated: boolean;
  /** Session has finished finalizing (status === 'completed'). The save
   *  endpoint rejects non-completed sessions, so the button stays disabled
   *  while turn 2 is still scoring even though turn 1 already has scores. */
  sessionCompleted: boolean;
};

export default function SaveQuestionButton({
  sessionId,
  alreadySaved,
  evaluated,
  sessionCompleted,
}: Props) {
  const { saved, save } = useSavedQuestions();
  const [justSaved, setJustSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSaved = alreadySaved || justSaved;
  const atCap = !isSaved && (saved?.length ?? 0) >= SAVED_QUESTION_CAP;
  const disabled = isSaved || atCap || !evaluated || !sessionCompleted || busy;

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      await save(sessionId);
      setJustSaved(true);
      trackEvent('saved_question_created');
    } catch (err) {
      // 409 = at cap, 422 = not evaluated. Surface the server's copy.
      setError(
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  const label = isSaved
    ? 'Saved'
    : busy
      ? 'Saving…'
      : atCap
        ? 'Saved questions full'
        : 'Save question';

  const title = !evaluated
    ? 'Available once the opening answer is scored'
    : !sessionCompleted
      ? 'Available once scoring finishes'
      : atCap
        ? 'Delete one in History to save more'
        : isSaved
          ? 'Saved to re-practice from History'
          : 'Save this opening question to re-practice later';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={isSaved}
        title={title}
        className={
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
          (isSaved
            ? 'border-accent bg-accent text-accent-fg'
            : disabled
              ? 'cursor-not-allowed border-border text-text-subtle opacity-70'
              : 'cursor-pointer border-border text-text-muted hover:border-border-strong hover:text-text')
        }
      >
        {isSaved ? (
          <BookmarkCheck aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <Bookmark aria-hidden className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-text-muted">
          {error}
        </p>
      )}
    </div>
  );
}
