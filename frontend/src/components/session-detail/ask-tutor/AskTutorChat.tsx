/**
 * Ask Tutor — the floating, minimizable chat for one turn's feedback.
 *
 * Non-modal by design: no dim backdrop, focus is NOT trapped, so the user can
 * read the feedback cards while the conversation stays parked. Three visual
 * states driven by the shared AskTutor context: closed (nothing), minimized
 * (a bottom-left pill), open (the window). Desktop docks it bottom-LEFT — the
 * bottom-right corner is taken by the global feedback FAB, and keeping the two
 * chat-shaped affordances in different corners stops them reading as the same
 * control. Below 900px it becomes a full-width bottom sheet.
 *
 * BACKEND: there is none yet. `send()` echoes the user's message and, after a
 * short beat, appends one honest placeholder reply. When the tutor API lands,
 * replace the `setTimeout` block with the real call; everything else (state,
 * composer, context chip, typing indicator, a11y) stays.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Minus, Sparkles, X } from 'lucide-react';

import { useAskTutor } from './_askTutor';
import { PieMark } from './PieMark';

type ChatRole = 'tutor' | 'user';
interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

const GREETING = 'How can I help you today?';

// One-tap starters mapped to the three jobs the tutor exists for. Tapping one
// fills the composer (it does NOT auto-send) so the user can edit before
// sending — deliberate, since non-native-English testers asked to reword.
const STARTERS = [
  'Help me rephrase unclear sentences',
  'How do I prepare for this kind of question?',
  'Explain a flagged transcript snippet',
];

const STUB_REPLY =
  "I'm not connected to your interview yet, so I can't answer for real here. Once the tutor is live I'll work through this with you using your transcript and feedback.";

let messageSeq = 0;
const nextId = () => `atm-${messageSeq++}`;

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;

export default function AskTutorChat({ subtitle }: { subtitle: string }) {
  const tutor = useAskTutor();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: nextId(), role: 'tutor', text: GREETING },
  ]);
  const [text, setText] = useState('');
  const [contextSnippet, setContextSnippet] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  // Last deep-link nonce we've seeded from. Tracked so a snippet click seeds
  // the composer during render (React's "adjust state while rendering" pattern)
  // instead of in an effect, which would trip react-hooks/set-state-in-effect.
  const [seededNonce, setSeededNonce] = useState<number | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const replyTimer = useRef<number | null>(null);
  const labelId = useId();

  const status = tutor?.status ?? 'closed';
  const showStarters = messages.length <= 1 && !contextSnippet && !thinking;

  const pending = tutor?.pendingSnippet;
  if (pending && pending.nonce !== seededNonce) {
    setSeededNonce(pending.nonce);
    setContextSnippet(pending.snippet);
    setText('Can you help me reword this part?');
  }

  // Auto-grow the composer up to a cap, then it scrolls internally.
  const grow = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);
  useEffect(grow, [text, grow]);

  // Focus the composer when the window opens or a new snippet is seeded.
  useEffect(() => {
    if (status === 'open') requestAnimationFrame(() => taRef.current?.focus());
  }, [status, seededNonce]);

  // Esc minimizes (keeps the conversation), matching the non-modal model.
  useEffect(() => {
    if (status !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutor?.minimize();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [status, tutor]);

  // Keep the latest message in view.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, thinking]);

  // Don't strand a pending stub reply if the panel unmounts (tab switch).
  useEffect(
    () => () => {
      if (replyTimer.current) window.clearTimeout(replyTimer.current);
    },
    [],
  );

  const send = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || thinking) return;
      setMessages((m) => [...m, { id: nextId(), role: 'user', text: trimmed }]);
      setText('');
      setContextSnippet(null);
      setThinking(true);
      // TODO(backend): replace with the tutor API call (stream into a message).
      replyTimer.current = window.setTimeout(() => {
        setMessages((m) => [...m, { id: nextId(), role: 'tutor', text: STUB_REPLY }]);
        setThinking(false);
        replyTimer.current = null;
      }, 900);
    },
    [thinking],
  );

  if (!tutor || status === 'closed') return null;

  if (status === 'minimized') {
    return (
      <button
        type="button"
        onClick={tutor.restore}
        aria-haspopup="dialog"
        className="fixed bottom-6 left-6 z-[60] inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium text-text shadow-lg transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <PieMark className="h-5 w-5" />
        Ask Tutor
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelId}
      className="ask-tutor-window fixed inset-x-0 bottom-0 z-[60] flex h-[80vh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-surface-raised shadow-lg min-[900px]:inset-x-auto min-[900px]:bottom-6 min-[900px]:left-6 min-[900px]:h-[70vh] min-[900px]:max-h-[34rem] min-[900px]:w-[23rem] min-[900px]:rounded-2xl min-[900px]:border"
    >
      {/* Mobile grab handle doubles as a minimize affordance. */}
      <button
        type="button"
        onClick={tutor.minimize}
        aria-label="Minimize tutor"
        className="flex shrink-0 justify-center py-2 min-[900px]:hidden"
      >
        <span className="block h-1.5 w-10 rounded-full bg-border-strong" />
      </button>

      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
          <PieMark className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={labelId} className="font-display text-sm font-semibold leading-tight text-text">
            Ask Tutor
          </p>
          <p className="truncate text-xs text-text-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={tutor.minimize}
          aria-label="Minimize tutor"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={tutor.close}
          aria-label="Close tutor"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        <ul className="flex flex-col gap-4">
          {messages.map((m) =>
            m.role === 'user' ? (
              <li key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-highlight/20 px-3.5 py-2.5 text-sm leading-6 text-text">
                  {m.text}
                </div>
              </li>
            ) : (
              <li key={m.id} className="flex items-end gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                  <PieMark className="h-4 w-4" />
                </span>
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-sunken px-3.5 py-2.5 text-sm leading-6 text-text">
                  {m.text}
                </div>
              </li>
            ),
          )}
          {thinking && (
            <li className="flex items-end gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                <PieMark className="h-4 w-4" />
              </span>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-sunken px-3.5 py-3.5">
                <span className="tutor-dot block h-1.5 w-1.5 rounded-full bg-text-muted" />
                <span
                  className="tutor-dot block h-1.5 w-1.5 rounded-full bg-text-muted"
                  style={{ animationDelay: '0.15s' }}
                />
                <span
                  className="tutor-dot block h-1.5 w-1.5 rounded-full bg-text-muted"
                  style={{ animationDelay: '0.3s' }}
                />
                <span className="sr-only">Tutor is typing</span>
              </div>
            </li>
          )}
        </ul>
        <div ref={listEndRef} />
      </div>

      <div className="shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {contextSnippet && (
          <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-deep" aria-hidden />
            <p className="min-w-0 flex-1 text-xs leading-5 text-text-muted">
              <span className="text-text-subtle">Re: </span>
              <span className="italic">&ldquo;{clip(contextSnippet, 90)}&rdquo;</span>
            </p>
            <button
              type="button"
              onClick={() => setContextSnippet(null)}
              aria-label="Remove reference"
              className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}

        {showStarters && (
          <div className="mb-2.5 flex flex-col items-start gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setText(s);
                  requestAnimationFrame(() => taRef.current?.focus());
                }}
                className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-left text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor={`${labelId}-input`} className="sr-only">
            Ask the tutor about this turn
          </label>
          <textarea
            id={`${labelId}-input`}
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder="Ask about this turn…"
            className="max-h-[120px] min-h-[2.5rem] flex-1 resize-none rounded-2xl bg-surface-sunken px-3.5 py-2.5 text-sm leading-6 text-text placeholder:text-text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-raised"
          />
          <button
            type="submit"
            disabled={!text.trim() || thinking}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-highlight text-primary-700 transition-colors hover:bg-amber-deep disabled:opacity-40 disabled:hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
