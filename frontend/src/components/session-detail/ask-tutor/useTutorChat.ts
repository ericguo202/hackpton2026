/**
 * useTutorChat — owns the Ask Tutor message list + the streamed backend call.
 *
 * Extracted from `AskTutorChat.tsx` (already a large component) so the network /
 * SSE / message-reducer logic lives apart from the presentational shell. The
 * conversation is ephemeral: this hook holds it in memory and nothing is
 * persisted, so unmounting the panel (a tab switch) discards it.
 *
 * Messages are a discriminated union of plain text bubbles and tool-step chips,
 * so a "Retrieving company brief…" step can render inline as the model calls it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, extractApiErrorDetail } from '../../../lib/api';
import { readSSE } from '../../../lib/sse';
import { useApi } from '../../../hooks/useApi';
import type {
  TutorErrorEvent,
  TutorHistoryItem,
  TutorMessageRequest,
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

const GREETING = 'How can I help you today?';

let seq = 0;
const nextId = () => `atm-${seq++}`;

const greetingMessage = (): TutorMessage => ({
  kind: 'text',
  id: nextId(),
  role: 'tutor',
  text: GREETING,
});

/** Resolve any still-running tool chip to its finished state. */
const settleTools = (list: TutorMessage[]): TutorMessage[] =>
  list.map((m) =>
    m.kind === 'tool' && m.state === 'running' ? { ...m, state: 'done' } : m,
  );

export function useTutorChat(sessionId?: string, turnId?: string) {
  const { apiStream } = useApi();

  // Ref mirror so `send` can read the current list synchronously (to build the
  // history payload) without a stale closure. Seeded from the same initial
  // value as the state; both are only ever updated together via `apply`.
  const [messages, setMessages] = useState<TutorMessage[]>(() => [greetingMessage()]);
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

  const apply = useCallback((updater: (prev: TutorMessage[]) => TutorMessage[]) => {
    if (!mountedRef.current) return;
    messagesRef.current = updater(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  const send = useCallback(
    async (raw: string, contextSnippet?: string) => {
      const trimmed = raw.trim();
      if (!trimmed || streamingRef.current || !sessionId || !turnId) return;

      streamingRef.current = true;
      setIsStreaming(true);

      // History = prior text bubbles (tool chips excluded), before this message.
      const history: TutorHistoryItem[] = messagesRef.current
        .filter((m): m is Extract<TutorMessage, { kind: 'text' }> => m.kind === 'text')
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

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

      const body: TutorMessageRequest = {
        message: trimmed,
        history,
        context_snippet: contextSnippet || null,
      };

      try {
        const res = await apiStream(
          `/api/v1/sessions/${sessionId}/turns/${turnId}/tutor`,
          {
            method: 'POST',
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );

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
              apply(settleTools);
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) return; // unmounted / superseded
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
    [apiStream, apply, sessionId, turnId],
  );

  return useMemo(
    () => ({ messages, isStreaming, send }),
    [messages, isStreaming, send],
  );
}
