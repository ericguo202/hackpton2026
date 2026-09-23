/**
 * GeneralTutorChat — the /tutor page's conversation surface.
 *
 * The full-page counterpart to the floating `AskTutorChat`: same message
 * vocabulary (tutor / user bubbles + inline tool-step chips), same avatar, same
 * streamed hook — but laid out as a normal reading column with the composer
 * pinned to the bottom of the viewport, which is what a general-purpose chat
 * wants and a 26rem floating window cannot give.
 *
 * Deliberately NOT a variant of `AskTutorChat`: that component is mostly
 * drag/resize/portal/bottom-sheet machinery for a floating window, none of which
 * applies here. What genuinely IS shared — the reducer, the SSE plumbing, the
 * quota handling, the avatar, the markdown renderer — is shared through
 * `useTutorChat`, `PieMark` and `TutorMarkdown` rather than through a prop.
 *
 * Replies here may carry source links (`allowLinks`), because this is the
 * surface that searches the live web and is required to cite what it found.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Check, Loader2, RotateCcw } from 'lucide-react';

import { PieMark } from '../session-detail/ask-tutor/PieMark';
import { TutorMarkdown } from '../session-detail/ask-tutor/TutorMarkdown';
import { useTutorChat } from '../session-detail/ask-tutor/useTutorChat';
import {
  GENERAL_CHAT_CREDIT_COST,
  MAX_CHAT_CREDITS_PER_DAY,
  MAX_GENERAL_MESSAGE_CHARS,
} from '../../types/tutor';
import { GENERAL_STARTERS } from './starters';

/** Show the char counter only once the cap is close enough to matter. */
const COUNTER_VISIBLE_FROM = 120;

export default function GeneralTutorChat() {
  const { messages, isStreaming, send, remaining, reset } = useTutorChat({
    mode: 'general',
  });

  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // `remaining` is null for Pro / unknown (no cap). Compared against this
  // surface's cost, not zero: one leftover credit can't buy a 2-credit chat.
  const limitReached = remaining !== null && remaining < GENERAL_CHAT_CREDIT_COST;
  const showLowHint =
    remaining !== null && !limitReached && remaining <= GENERAL_CHAT_CREDIT_COST * 3;

  const showStarters = messages.length <= 1 && !isStreaming && !limitReached;
  // Typing dots: streaming, but nothing has come back yet (or only a tool chip).
  const last = messages[messages.length - 1];
  const showTyping =
    isStreaming && !(last && last.kind === 'text' && last.role === 'tutor');

  // Scroll-anchor ONLY when the user sends a message — never as the tutor's
  // reply streams in. A new user bubble (and the typing indicator under it)
  // drops to the bottom of the view, so the reply then grows downward from the
  // top of the column and the user reads it from the start. Anchoring on every
  // streamed token would jump them to the END of a long reply, forcing a scroll
  // back up to read it. Same rule as `AskTutorChat` — replies here run 7-8
  // sentences, so the jump is worse on this surface, not better.
  const userMsgCount = messages.reduce(
    (n, m) => (m.kind === 'text' && m.role === 'user' ? n + 1 : n),
    0,
  );
  const prevUserMsgCount = useRef(userMsgCount);
  useEffect(() => {
    if (userMsgCount > prevUserMsgCount.current) {
      listEndRef.current?.scrollIntoView({ block: 'end' });
    }
    prevUserMsgCount.current = userMsgCount;
  }, [userMsgCount]);

  // Grow the composer with its content, up to a few lines.
  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || isStreaming || limitReached) return;
      send(trimmed.slice(0, MAX_GENERAL_MESSAGE_CHARS));
      setText('');
      requestAnimationFrame(resize);
    },
    [isStreaming, limitReached, resize, send],
  );

  const remainingChars = MAX_GENERAL_MESSAGE_CHARS - text.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Conversation */}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <ul className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
          {messages.map((m) => {
            // Tool-call step ("Searching the web…") — a spinner while running,
            // a check once the model moves on.
            if (m.kind === 'tool') {
              return (
                <li key={m.id} className="flex items-end gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                    <PieMark className="h-4.5 w-4.5" />
                  </span>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-surface-sunken px-4 py-2.5 text-xs text-text-muted">
                    {m.state === 'running' ? (
                      <Loader2
                        className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-deep"
                        aria-hidden
                      />
                    ) : (
                      <Check className="h-3.5 w-3.5 shrink-0 text-amber-deep" aria-hidden />
                    )}
                    <span>
                      {m.label}
                      {m.state === 'running' ? '…' : ''}
                    </span>
                  </div>
                </li>
              );
            }
            if (m.role === 'user') {
              return (
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] break-words rounded-2xl rounded-br-sm bg-highlight/20 px-4 py-2.5 text-sm leading-6 text-text">
                    {m.text}
                  </div>
                </li>
              );
            }
            return (
              <li key={m.id} className="flex items-end gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                  <PieMark className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 max-w-[85%] break-words rounded-2xl rounded-bl-sm bg-surface-sunken px-4 py-2.5 text-sm leading-6 text-text">
                  {/* The one surface where the model may cite sources. */}
                  <TutorMarkdown text={m.text} allowLinks />
                </div>
              </li>
            );
          })}
          {showTyping && (
            <li className="flex items-end gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                <PieMark className="h-4.5 w-4.5" />
              </span>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-sunken px-4 py-3.5">
                <span className="tutor-dot block h-1.5 w-1.5 rounded-full bg-text-muted" />
                <span
                  className="tutor-dot block h-1.5 w-1.5 rounded-full bg-text-muted"
                  style={{ animationDelay: '0.15s' }}
                />
                <span
                  className="tutor-dot block h-1.5 w-1.5 rounded-full bg-text-muted"
                  style={{ animationDelay: '0.3s' }}
                />
                <span className="sr-only">Tutor is thinking</span>
              </div>
            </li>
          )}
          <div ref={listEndRef} />
        </ul>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-3xl px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {showStarters && (
            <div className="mb-3 flex flex-wrap gap-2">
              {GENERAL_STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setText(s);
                    taRef.current?.focus();
                    requestAnimationFrame(resize);
                  }}
                  className="rounded-full border border-border bg-surface-raised px-3.5 py-1.5 text-left text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {limitReached ? (
            <p className="mb-2 text-xs leading-5 text-critique" role="alert">
              You don&rsquo;t have enough chat credits left today for the general
              coach (it costs {GENERAL_CHAT_CREDIT_COST} of your{' '}
              {MAX_CHAT_CREDITS_PER_DAY}). They reset at midnight.
            </p>
          ) : null}

          {!limitReached && remainingChars <= COUNTER_VISIBLE_FROM && (
            <p
              className={
                'mb-1 text-right text-xs tabular-nums ' +
                (remainingChars <= 0 ? 'text-amber-deep' : 'text-text-subtle')
              }
              aria-live="polite"
            >
              {text.length}/{MAX_GENERAL_MESSAGE_CHARS}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor={`${labelId}-input`} className="sr-only">
              Ask your interview coach
            </label>
            <textarea
              id={`${labelId}-input`}
              ref={taRef}
              rows={1}
              maxLength={MAX_GENERAL_MESSAGE_CHARS}
              value={text}
              disabled={limitReached}
              onChange={(e) => {
                setText(e.target.value);
                resize();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(text);
                }
              }}
              placeholder={
                limitReached
                  ? 'Out of chat credits today'
                  : 'Ask about a company, a question type, or your progress…'
              }
              className="max-h-[200px] min-h-[2.75rem] flex-1 resize-none rounded-2xl bg-surface-sunken px-4 py-3 text-sm leading-6 text-text placeholder:text-text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            />
            {/* New chat — the conversation survives navigation, so there has to
                be a way to put it down deliberately. */}
            <button
              type="button"
              onClick={reset}
              disabled={isStreaming || messages.length <= 1}
              title="Start a new chat"
              aria-label="Start a new chat"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="submit"
              disabled={!text.trim() || isStreaming || limitReached}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-highlight text-primary-700 transition-colors hover:bg-amber-deep disabled:opacity-40 disabled:hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
          </form>

          {/* Budget line. Unlike the turn chat's near-limit-only hint, this one
              is ALWAYS on: a chat here costs 2 of 20, so a user who can't see
              the balance can't tell whether they have nine questions left or
              one. Naming the per-chat cost is what makes the number divisible
              into "how many more can I ask". */}
          {!limitReached && remaining !== null && (
            <p
              className={
                'mt-2 text-xs tabular-nums ' +
                (showLowHint ? 'text-amber-deep' : 'text-text-subtle')
              }
              aria-live="polite"
            >
              {remaining} of {MAX_CHAT_CREDITS_PER_DAY} chat credits left today
              &middot; each chat here costs {GENERAL_CHAT_CREDIT_COST}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
