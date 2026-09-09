/**
 * useTutorChat — owns an Ask Tutor message list + the streamed backend call, for
 * either tutor surface.
 *
 * Extracted from `AskTutorChat.tsx` (already a large component) so the network /
 * SSE / message-reducer logic lives apart from the presentational shell, and now
 * shared by the `/tutor` page's general coach. `mode` selects the endpoint, the
 * request body, the credit cost and the greeting; everything else — the reducer,
 * the streamed-bubble assembly, the quota handling — is identical, which is the
 * point of sharing it.
 *
 * Nothing is persisted server-side either way. In `turn` mode the conversation
 * lives for the life of the mount, so a tab switch discards it. In `general` mode
 * it is parked in a module-level store so navigating to History and back returns
 * to the same conversation; a hard refresh still clears it (see
 * `generalConversationStore` below).
 *
 * Messages are a discriminated union of plain text bubbles and tool-step chips,
 * so a "Retrieving company brief…" step can render inline as the model calls it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, extractApiErrorDetail } from '../../../lib/api';
import { readSSE } from '../../../lib/sse';
import { useApi } from '../../../hooks/useApi';
import { useMe } from '../../../hooks/useMe';
import { MAX_CHAT_CREDITS_PER_DAY, chatCreditCost } from '../../../types/tutor';
import type {
  GeneralTutorMessageRequest,
  TutorDoneEvent,
  TutorErrorEvent,
  TutorHistoryItem,
  TutorMessageRequest,
  TutorMode,
  TutorToolEvent,
  TutorTokenEvent,
} from '../../../types/tutor';

export type TutorMessage =
  | {
      kind: 'text';
      id: string;
      role: 'tutor' | 'user';
      text: string;
      /** Set on a user bubble launched from an "Ask about this" snippet, so the
       *  attached context stays visible after sending. */
      contextSnippet?: string;
    }
  | { kind: 'tool'; id: string; label: string; state: 'running' | 'done' };

const TURN_GREETING = 'How can I help you today?';
const GENERAL_GREETING =
  "I'm your interview coach. Ask me about a company's interview process, a "
  + 'question type you want to get better at, or what your practice history says '
  + 'you should work on.';

let seq = 0;
const nextId = () => `atm-${seq++}`;

const greetingMessage = (mode: TutorMode): TutorMessage => ({
  kind: 'text',
  id: nextId(),
  role: 'tutor',
  text: mode === 'general' ? GENERAL_GREETING : TURN_GREETING,
});

/**
 * Where a general-coach conversation lives between page mounts.
 *
 * The /tutor page is a full route, so the user leaves it constantly (to check a
 * session, to look at History) and expects to come back to what they were
 * saying — a chat that wipes on every navigation reads as broken. Module scope
 * gives us exactly that and nothing more: it survives unmount, and a hard
 * refresh clears it, which keeps the "the backend persists NOTHING" contract
 * intact. Turn mode deliberately does NOT use this — each turn's chat is scoped
 * to the feedback it's about.
 */
const generalConversationStore: { messages: TutorMessage[] | null } = {
  messages: null,
};

/** Discard the parked general conversation (the page's "new chat" control). */
export function resetGeneralTutorConversation() {
  generalConversationStore.messages = null;
}

/** Resolve any still-running tool chip to its finished state. */
const settleTools = (list: TutorMessage[]): TutorMessage[] =>
  list.map((m) =>
    m.kind === 'tool' && m.state === 'running' ? { ...m, state: 'done' } : m,
  );

interface Options {
  mode: TutorMode;
  /** Required in `turn` mode; ignored in `general` mode. */
  sessionId?: string;
  turnId?: string;
}

export function useTutorChat({ mode, sessionId, turnId }: Options) {
  const { apiStream } = useApi();
  const { me } = useMe();
  const isGeneral = mode === 'general';
  const creditCost = chatCreditCost(mode);

  // Remaining chat CREDITS for today. null = unknown / Pro / unlimited. Seeded
  // once from /me (free tier) and then driven live by the `done` event's
  // `remaining` and a 429 (→ 0). Seeding happens during render (React-19
  // "compare prop to tracked state" pattern) rather than in an effect, both to
  // avoid set-state-in-effect and so a live decrement is never clobbered by a
  // later broadcast /me.
  const [remaining, setRemaining] = useState<number | null>(null);
  const [seededFromMe, setSeededFromMe] = useState(false);
  if (!seededFromMe && me) {
    setSeededFromMe(true);
    if (remaining === null && me.tier === 'free') {
      setRemaining(Math.max(0, MAX_CHAT_CREDITS_PER_DAY - me.daily_chat_count));
    }
  }

  // Ref mirror so `send` can read the current list synchronously (to build the
  // history payload) without a stale closure. Seeded from the same initial
  // value as the state; both are only ever updated together via `apply`.
  const [messages, setMessages] = useState<TutorMessage[]>(() => {
    if (isGeneral && generalConversationStore.messages) {
      return generalConversationStore.messages;
    }
    return [greetingMessage(mode)];
  });
  const messagesRef = useRef<TutorMessage[]>(messages);

  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const apply = useCallback(
    (updater: (prev: TutorMessage[]) => TutorMessage[]) => {
      if (!mountedRef.current) return;
      messagesRef.current = updater(messagesRef.current);
      setMessages(messagesRef.current);
      if (isGeneral) generalConversationStore.messages = messagesRef.current;
    },
    [isGeneral],
  );

  /** Clear the conversation back to its greeting (general mode's "new chat"). */
  const reset = useCallback(() => {
    if (streamingRef.current) return;
    resetGeneralTutorConversation();
    messagesRef.current = [greetingMessage(mode)];
    setMessages(messagesRef.current);
    if (isGeneral) generalConversationStore.messages = messagesRef.current;
  }, [isGeneral, mode]);

  const send = useCallback(
    async (raw: string, contextSnippet?: string) => {
      const trimmed = raw.trim();
      if (!trimmed || streamingRef.current) return;
      if (!isGeneral && (!sessionId || !turnId)) return;
      // Not enough credits for THIS surface — defensive; the composer is also
      // disabled in the UI. Checked against the cost, not against zero, so a
      // single leftover credit doesn't appear to buy a 2-credit general chat.
      if (remaining !== null && remaining < creditCost) return;

      streamingRef.current = true;
      setIsStreaming(true);

      // History = prior text bubbles (tool chips excluded), before this message.
      // Content is clamped to the backend schema's 4000-char cap so an unusually
      // long reply can never 422 the next message.
      const history: TutorHistoryItem[] = messagesRef.current
        .filter((m): m is Extract<TutorMessage, { kind: 'text' }> => m.kind === 'text')
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text.slice(0, 4000),
        }));

      apply((prev) => [
        ...prev,
        {
          kind: 'text',
          id: nextId(),
          role: 'user',
          text: trimmed,
          contextSnippet: contextSnippet || undefined,
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      // The streamed assistant bubble is created on the first token, then
      // extended in place. Tracked outside the reducer so React can't double it.
      let assistantId: string | null = null;

      const path = isGeneral
        ? '/api/v1/tutor'
        : `/api/v1/sessions/${sessionId}/turns/${turnId}/tutor`;
      const body: TutorMessageRequest | GeneralTutorMessageRequest = isGeneral
        ? { message: trimmed, history }
        : { message: trimmed, history, context_snippet: contextSnippet || null };

      try {
        const res = await apiStream(path, {
          method: 'POST',
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        await readSSE(
          res,
          (event) => {
            if (event.type === 'tool') {
              const data = event.data as TutorToolEvent;
              apply((prev) => [
                ...prev,
                { kind: 'tool', id: data.id || nextId(), label: data.label, state: 'running' },
              ]);
            } else if (event.type === 'token') {
              const data = event.data as TutorTokenEvent;
              if (!data.text) return;
              if (assistantId === null) {
                const id = nextId();
                assistantId = id;
                apply((prev) => [
                  ...settleTools(prev),
                  { kind: 'text', id, role: 'tutor', text: data.text },
                ]);
              } else {
                const id = assistantId;
                apply((prev) =>
                  prev.map((m) =>
                    m.id === id && m.kind === 'text'
                      ? { ...m, text: m.text + data.text }
                      : m,
                  ),
                );
              }
            } else if (event.type === 'error') {
              const data = event.data as TutorErrorEvent;
              apply((prev) => [
                ...settleTools(prev),
                { kind: 'text', id: nextId(), role: 'tutor', text: data.message },
              ]);
            } else if (event.type === 'done') {
              const data = event.data as TutorDoneEvent;
              if (typeof data?.remaining === 'number') setRemaining(data.remaining);
              apply(settleTools);
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) return; // unmounted / superseded
        if (err instanceof ApiError && err.status === 429) {
          // Out of chat credits (stale client thought it had budget). Flip to
          // the disabled / red-footer state; no chat bubble. `finally` still runs.
          setRemaining(0);
          return;
        }
        let text = 'Something went wrong reaching the tutor. Please try again.';
        if (err instanceof ApiError) {
          if (err.status === 503) {
            text = 'Content checks are temporarily unavailable. Please try again in a moment.';
          } else {
            text = extractApiErrorDetail(err);
          }
        }
        apply((prev) => [
          ...settleTools(prev),
          { kind: 'text', id: nextId(), role: 'tutor', text },
        ]);
      } finally {
        apply(settleTools);
        streamingRef.current = false;
        if (mountedRef.current) setIsStreaming(false);
      }
    },
    [apiStream, apply, creditCost, isGeneral, remaining, sessionId, turnId],
  );

  return useMemo(
    () => ({ messages, isStreaming, send, remaining, creditCost, reset }),
    [messages, isStreaming, send, remaining, creditCost, reset],
  );
}
