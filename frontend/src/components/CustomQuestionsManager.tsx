/**
 * CustomQuestionsManager — author + manage custom interview questions on the
 * Personalize page.
 *
 * Fully independent from the profile form above it: its own state, its own
 * "Add" button, and it never navigates away (the user stays on /personalize to
 * review what saved and fix what was blocked). Questions are entered one-per-line
 * (single add = one line, bulk = paste many); on Add each line is screened
 * server-side (moderation → injection → an LLM validity/relevance check) and
 * the per-question report comes back as created + rejected. Over-long lines and
 * obvious injection are also flagged client-side for instant feedback before the
 * round trip (the backend re-checks authoritatively).
 */

import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from './ui/button';
import { useCustomQuestions } from '../hooks/useCustomQuestions';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { violatesContentPolicy } from '../lib/contentPolicy';
import {
  CUSTOM_QUESTION_CAP,
  MAX_QUESTION_CHARS,
  type RejectedQuestion,
} from '../types/customQuestions';

const inputClass =
  'w-full rounded border border-border bg-surface-sunken px-3 py-2 text-text ' +
  'placeholder:text-text-subtle ' +
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-surface';

const cardClass = 'rounded-lg bg-surface-raised p-5';

/** Split a textarea blob into trimmed, de-duplicated, non-empty lines. */
function splitLines(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export default function CustomQuestionsManager() {
  const { questions, create, remove, isLoading } = useCustomQuestions();

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedQuestion[]>([]);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const count = questions?.length ?? 0;
  const remainingSlots = Math.max(0, CUSTOM_QUESTION_CAP - count);
  const atCap = remainingSlots === 0;

  const lines = useMemo(() => splitLines(draft), [draft]);
  const canSubmit = lines.length > 0 && !submitting && !atCap;

  async function handleAdd() {
    setError(null);
    setAddedCount(null);
    setRejected([]);

    if (lines.length === 0) return;

    // Client-side pre-screen: over-long lines + obvious injection are rejected
    // instantly so the user gets feedback without a round trip. Everything else
    // goes to the server for the authoritative moderation/validity check.
    const localRejected: RejectedQuestion[] = [];
    const toSend: string[] = [];
    for (const line of lines) {
      if (line.length > MAX_QUESTION_CHARS) {
        localRejected.push({
          text: line,
          reason: `Too long — keep it under ${MAX_QUESTION_CHARS} characters.`,
        });
      } else if (violatesContentPolicy(line)) {
        localRejected.push({
          text: line,
          reason:
            'Looks like it contains instructions to the AI, not an interview question.',
        });
      } else {
        toSend.push(line);
      }
    }

    setSubmitting(true);
    try {
      let created = 0;
      const serverRejected: RejectedQuestion[] = [];
      if (toSend.length > 0) {
        const result = await create(toSend);
        created = result.created.length;
        serverRejected.push(...result.rejected);
      }

      const allRejected = [...localRejected, ...serverRejected];
      setRejected(allRejected);
      setAddedCount(created);
      // Leave only the rejected lines in the box so the user can fix them;
      // accepted ones now live in the list below.
      setDraft(allRejected.map((r) => r.text).join('\n'));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : (err as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={`${cardClass} mt-5`}>
      <div className="space-y-1">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-sm">
          Custom questions
        </p>
        <p className="text-xs leading-5 text-text-subtle">
          Add your own interview questions to practice — one per line. Pick one
          at session setup to use it instead of a generated question. Up to{' '}
          {CUSTOM_QUESTION_CAP} saved.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 min-[900px]:grid-cols-2">
        {/* Compose */}
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={submitting || atCap}
            placeholder={
              atCap
                ? 'You have reached the maximum number of custom questions.'
                : 'Tell me about a time you handled a tight deadline.\nDescribe a conflict you resolved with a teammate.'
            }
            rows={5}
            className={`${inputClass} min-h-[8rem] resize-none disabled:cursor-not-allowed disabled:opacity-50`}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-text-subtle">
            <span className="tabular-nums">
              {count}/{CUSTOM_QUESTION_CAP} saved
              {lines.length > 0 && ` · ${lines.length} to add`}
            </span>
            <Button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!canSubmit}
            >
              {submitting ? 'Checking...' : 'Add questions'}
            </Button>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded border border-border bg-surface px-3 py-2 text-sm text-critique"
            >
              {error}
            </p>
          )}

          {addedCount !== null && (
            <p className="text-sm text-text-muted">
              {addedCount > 0
                ? `Added ${addedCount} question${addedCount === 1 ? '' : 's'}.`
                : 'No questions were added.'}
            </p>
          )}

          {rejected.length > 0 && (
            <div className="space-y-1.5 rounded border border-border bg-surface px-3 py-2">
              <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-[11px]">
                Couldn&apos;t add these
              </p>
              <ul className="space-y-1.5">
                {rejected.map((r, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-text">&ldquo;{r.text}&rdquo;</span>
                    <span className="block text-xs text-critique">
                      {r.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Existing list */}
        <div>
          {isLoading && count === 0 ? (
            <p className="text-sm text-text-subtle">Loading…</p>
          ) : count === 0 ? (
            <p className="text-sm text-text-subtle">
              No custom questions yet. Add one to get started.
            </p>
          ) : (
            <ul className="max-h-[14rem] space-y-2 overflow-y-auto pr-1">
              {questions!.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start justify-between gap-3 rounded border border-border bg-surface-sunken px-3 py-2"
                >
                  <span className="text-sm text-text">{q.question_text}</span>
                  <button
                    type="button"
                    aria-label="Delete question"
                    onClick={() => void remove(q.id)}
                    className="shrink-0 rounded p-1 text-text-muted transition-colors hover:text-critique focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
