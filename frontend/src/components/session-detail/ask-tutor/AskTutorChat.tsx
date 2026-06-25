/**
 * Ask Tutor — the floating, minimizable chat for one turn's feedback.
 *
 * Non-modal by design: no dim backdrop, focus is NOT trapped, so the user can
 * read the feedback cards while the conversation stays parked. Three visual
 * states driven by the shared AskTutor context: closed (nothing), minimized
 * (a bottom-left pill), open (the window). On desktop the open window can be
 * dragged by its header and expanded (header toggle) to fill the available
 * height for reading a long reply without scrolling. Desktop docks it bottom-LEFT — the
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
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Check, Loader2, Maximize2, Minimize2, Minus, Sparkles, X } from 'lucide-react';

import { useAskTutor } from './_askTutor';
import { PieMark } from './PieMark';
import { TutorMarkdown } from './TutorMarkdown';
import { useTutorChat } from './useTutorChat';
import { MAX_TUTOR_CHATS_PER_DAY } from '../../../types/tutor';

// One-tap starters mapped to the three jobs the tutor exists for. Tapping one
// fills the composer (it does NOT auto-send) so the user can edit before
// sending — deliberate, since non-native-English testers asked to reword.
const STARTERS = [
  'Help me rephrase unclear sentences',
  'How do I prepare for this kind of question?',
  'Explain a flagged transcript snippet',
];

// Desktop drag tuning. ANCHOR mirrors the window's resting bottom-6/left-6
// inset (1.5rem); the drag offset is a translate() relative to that anchor.
const DESKTOP_MQ = '(min-width: 900px)';
const DRAG_MARGIN = 8;
const DRAG_ANCHOR = 24;

// Resize bounds (desktop only). The window is anchored bottom-left and grows
// up + right, so "expand" fills the available height and widens to EXPAND_W —
// enough to read a long reply without scrolling, while the feedback cards on
// the right stay visible. Mobile stays the 80vh bottom sheet (already tall).
const RESIZE_MIN_W = 320; // 20rem
const RESIZE_MIN_H = 320;
const EXPAND_W = 416; // 26rem

// Mobile bottom-sheet resize. Dragging the grab handle sets an explicit height
// up to MOBILE_MAX_VH of the viewport, so the sheet can be compressed out of the
// way or pulled up to read a long reply. A move past TAP_SLOP px counts as a
// drag; anything shorter is a tap and still minimizes (the handle's legacy role).
//
// The compress floor is NOT a fixed constant: the composer must always stay
// visible (otherwise the sheet is unusable and re-opening recovers awkwardly),
// but its height varies — the starter chips, the snippet chip and the char
// counter all grow it. So the floor is measured live from the non-scrolling
// chrome (handle + header + composer) plus a thin peek of the message list.
// MOBILE_MIN_H is only a fallback for the first frame before refs are measured.
const MOBILE_MIN_H = 240;
const MOBILE_MAX_VH = 0.92;
const SHEET_PEEK = 8;
const TAP_SLOP = 5;
const mobileMaxH = () => Math.round(window.innerHeight * MOBILE_MAX_VH);

// Hard cap on a typed message. Real tutor questions are short, and every send
// costs LLM tokens, so this bounds abuse. Mirrors the backend
// `TutorMessageIn.message` cap (backend/app/schemas/tutor.py). The attached
// "Ask about this" snippet is a separate field and is NOT counted here.
const MAX_MESSAGE_CHARS = 300;
const clampNum = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;

export default function AskTutorChat({
  subtitle,
  sessionId,
  turnId,
}: {
  subtitle: string;
  sessionId?: string;
  turnId?: string;
}) {
  const tutor = useAskTutor();
  const { messages, isStreaming, send, remaining } = useTutorChat(sessionId, turnId);

  // Daily chat-quota UI state. `remaining` is null for Pro / unknown (no cap).
  const limitReached = remaining !== null && remaining <= 0;
  const showLowHint = remaining !== null && remaining > 0 && remaining <= 3;

  const [text, setText] = useState('');
  const [contextSnippet, setContextSnippet] = useState<string | null>(null);
  // Last deep-link nonce we've seeded from. Tracked so a snippet click seeds
  // the composer during render (React's "adjust state while rendering" pattern)
  // instead of in an effect, which would trip react-hooks/set-state-in-effect.
  const [seededNonce, setSeededNonce] = useState<number | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const status = tutor?.status ?? 'closed';
  const showStarters =
    messages.length <= 1 && !contextSnippet && !isStreaming && !limitReached;
  // Typing dots: streaming, but the latest message isn't yet an in-progress
  // tutor bubble (nothing has streamed back, or only a tool chip has landed).
  const last = messages[messages.length - 1];
  const showTyping =
    isStreaming && !(last && last.kind === 'text' && last.role === 'tutor');

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

  // Scroll-anchor ONLY when the user sends a message — never as the tutor's
  // reply streams in. A new user bubble (and the typing indicator under it)
  // drops to the bottom of the view, so the reply then grows downward from the
  // top of the panel and the user reads it from the start. Auto-scrolling on
  // every streamed token would jump them to the END of a long reply, forcing a
  // scroll back up to read it — the behavior this deliberately avoids.
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

  // Submit the composer: hand the text + any attached snippet to the streaming
  // hook (which appends the user bubble), then clear the local input.
  const submit = useCallback(
    (raw: string) => {
      // Clamp defensively so even a programmatic value-set can't outrun the
      // textarea's maxLength and trip the server's 300-char 422.
      const trimmed = raw.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!trimmed || isStreaming || limitReached) return;
      void send(trimmed, contextSnippet ?? undefined);
      setText('');
      setContextSnippet(null);
    },
    [isStreaming, limitReached, send, contextSnippet],
  );

  // --- Desktop drag (the header is the handle) ----------------------------
  // The window stays a `position: fixed` element anchored bottom-left; dragging
  // only sets a translate() offset (applied via CSS vars + a desktop-gated
  // rule), so the mobile bottom-sheet layout is never affected and minimize
  // always returns the pill to the corner.
  const winRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    { px: number; py: number; ox: number; oy: number; w: number; h: number } | null
  >(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragged, setDragged] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Explicit desktop size (px) once the user expands/restores; null = the
  // default compact box. Applied via CSS vars in a desktop-gated rule so the
  // mobile bottom sheet is never touched, mirroring the drag-offset mechanism.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const isSized = size !== null;

  // Mobile-only: explicit bottom-sheet height (px) once the user drags the grab
  // handle; null = the default h-[80vh]. Applied via the --msh CSS var in a
  // max-width:899px rule so the desktop drag/size geometry is never touched.
  const [mobileHeight, setMobileHeight] = useState<number | null>(null);
  // Tracks an in-flight handle drag and whether it has crossed TAP_SLOP, so
  // pointerup can tell a tap (→ minimize) from a resize (→ do nothing).
  const sheetDragRef = useRef<{ py: number; h: number; moved: boolean } | null>(null);
  // Measured to compute the live compress floor (see sheetFloorH).
  const handleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Smallest sheet height that still shows the handle, header and composer in
  // full — the message list collapses to a thin SHEET_PEEK sliver. Measured
  // live so it tracks the composer growing (starter chips / snippet / counter),
  // and never exceeds the max so the clamp range stays valid.
  const sheetFloorH = useCallback(() => {
    const chrome =
      (handleRef.current?.offsetHeight ?? 0) +
      (headerRef.current?.offsetHeight ?? 0) +
      (composerRef.current?.offsetHeight ?? 0);
    const floor = chrome > 0 ? chrome + SHEET_PEEK : MOBILE_MIN_H;
    return Math.min(floor, mobileMaxH());
  }, []);

  // Keep the window MARGIN px inside every viewport edge. On-screen position of
  // the bottom-left anchor: left = ANCHOR + ox, top = (vh - ANCHOR - h) + oy.
  const clampOffset = useCallback((ox: number, oy: number, w: number, h: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minOx = DRAG_MARGIN - DRAG_ANCHOR;
    const maxOx = vw - w - DRAG_MARGIN - DRAG_ANCHOR;
    const minOy = DRAG_MARGIN - (vh - DRAG_ANCHOR - h);
    const maxOy = DRAG_ANCHOR - DRAG_MARGIN;
    return {
      x: Math.min(Math.max(ox, minOx), Math.max(minOx, maxOx)),
      y: Math.min(Math.max(oy, minOy), Math.max(minOy, maxOy)),
    };
  }, []);

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return; // primary button only
    if (!window.matchMedia(DESKTOP_MQ).matches) return; // docked on mobile
    if ((e.target as HTMLElement).closest('button')) return; // let buttons click
    const el = winRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = {
      px: e.clientX,
      py: e.clientY,
      ox: offset.x,
      oy: offset.y,
      w: r.width,
      h: r.height,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clampOffset(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py), d.w, d.h));
    if (!dragged) setDragged(true);
  };
  const onHeaderPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const resetPosition = () => {
    setOffset({ x: 0, y: 0 });
    setDragged(false);
    setSize(null);
  };

  // Expand to fill the available height (and widen to EXPAND_W) from wherever
  // the window currently sits, or restore the compact default if already
  // expanded. Computed off the live rect so it respects a dragged position.
  const toggleExpand = useCallback(() => {
    if (!window.matchMedia(DESKTOP_MQ).matches) return; // bottom sheet on mobile
    if (size) {
      setSize(null);
      return;
    }
    const el = winRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = window.innerWidth - DRAG_MARGIN - r.left;
    const maxH = r.bottom - DRAG_MARGIN;
    setSize({
      w: clampNum(EXPAND_W, RESIZE_MIN_W, maxW),
      h: Math.max(RESIZE_MIN_H, maxH),
    });
  }, [size]);

  // --- Mobile drag-to-resize (the grab handle is the handle) ---------------
  // Dragging up grows the sheet, down compresses it; a tap (no drag past
  // TAP_SLOP) still minimizes via the trailing click. touch-action:none on the
  // handle keeps the gesture from scrolling the sheet/page instead.
  const onHandlePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (window.matchMedia(DESKTOP_MQ).matches) return; // handle is desktop-hidden
    const el = winRef.current;
    if (!el) return;
    sheetDragRef.current = {
      py: e.clientY,
      h: el.getBoundingClientRect().height,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = sheetDragRef.current;
    if (!d) return;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.abs(dy) > TAP_SLOP) d.moved = true;
    if (d.moved) setMobileHeight(clampNum(d.h - dy, sheetFloorH(), mobileMaxH()));
  };
  const onHandlePointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = sheetDragRef.current;
    sheetDragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d && !d.moved) tutor?.minimize(); // a tap (no real drag) minimizes
  };
  // Keyboard activation (Enter/Space) fires click with detail 0 and no pointer
  // events; pointer taps are already handled in pointerup, so ignore them here.
  const onHandleClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (e.detail === 0) tutor?.minimize();
  };

  // Re-clamp if the viewport shrinks under a dragged or expanded window, so it
  // never spills off-screen.
  useEffect(() => {
    if (!dragged && !isSized && mobileHeight === null) return;
    const onResize = () => {
      const el = winRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (dragged) setOffset((o) => clampOffset(o.x, o.y, r.width, r.height));
      setSize((s) => {
        if (!s) return s;
        const maxW = window.innerWidth - DRAG_MARGIN - r.left;
        const maxH = r.bottom - DRAG_MARGIN;
        return { w: clampNum(s.w, RESIZE_MIN_W, maxW), h: clampNum(s.h, RESIZE_MIN_H, maxH) };
      });
      // Keep a resized bottom sheet within the (possibly rotated) viewport, and
      // re-assert the composer-visible floor in case the chrome reflowed.
      setMobileHeight((h) => (h === null ? h : clampNum(h, sheetFloorH(), mobileMaxH())));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [dragged, isSized, mobileHeight, clampOffset, sheetFloorH]);

  // The composer's height is dynamic (starter chips, snippet chip, char counter,
  // the auto-growing textarea). If it grows while the sheet is compressed, lift
  // the sheet so the composer never clips below the floor. A ResizeObserver is
  // the right subscription here — it catches every reflow without enumerating
  // each cause, and re-attaches when the window opens (status dep). No-op while
  // unsized (mobileHeight null), so desktop is untouched.
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setMobileHeight((h) => (h === null ? null : Math.max(h, sheetFloorH())));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, sheetFloorH]);

  if (!tutor || status === 'closed') return null;

  if (status === 'minimized') {
    return createPortal(
      <button
        type="button"
        onClick={tutor.restore}
        aria-haspopup="dialog"
        className="fixed bottom-6 left-6 z-[60] inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium text-text shadow-lg transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <PieMark className="h-5 w-5" />
        Ask Tutor
      </button>,
      document.body,
    );
  }

  // Portal to <body> so the viewport-fixed window lives in the root stacking
  // context. Otherwise the SessionDetail tabpanel's `anim-crossfade` (an opacity
  // animation = a stacking context) would trap the window's z-[60] beneath the
  // sibling folder-tab strip (z-10), letting the tabs paint over the chat.
  return createPortal(
    <div
      ref={winRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelId}
      data-dragged={dragged ? 'true' : undefined}
      data-sized={size ? 'true' : undefined}
      data-msized={mobileHeight !== null ? 'true' : undefined}
      style={
        dragged || size || mobileHeight !== null
          ? ({
              ...(dragged ? { '--atx': `${offset.x}px`, '--aty': `${offset.y}px` } : {}),
              ...(size ? { '--atw': `${size.w}px`, '--ath': `${size.h}px` } : {}),
              ...(mobileHeight !== null ? { '--msh': `${mobileHeight}px` } : {}),
            } as CSSProperties)
          : undefined
      }
      className="ask-tutor-window fixed inset-x-0 bottom-0 z-[60] flex h-[80vh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-surface-raised shadow-lg min-[900px]:inset-x-auto min-[900px]:bottom-6 min-[900px]:left-6 min-[900px]:h-[70vh] min-[900px]:max-h-[34rem] min-[900px]:w-[23rem] min-[900px]:rounded-2xl min-[900px]:border"
    >
      {/* Mobile grab handle: drag to resize the sheet, tap to minimize.
          touch-action:none so the vertical drag resizes instead of scrolling. */}
      <button
        ref={handleRef}
        type="button"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        onClick={onHandleClick}
        aria-label="Drag to resize, or tap to minimize"
        className="group flex shrink-0 touch-none cursor-ns-resize justify-center py-2.5 min-[900px]:hidden"
      >
        <span className="block h-1.5 w-10 rounded-full bg-border-strong transition-colors group-active:bg-text-muted" />
      </button>

      <header
        ref={headerRef}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        onDoubleClick={(e) => {
          if (
            window.matchMedia(DESKTOP_MQ).matches &&
            !(e.target as HTMLElement).closest('button')
          ) {
            resetPosition();
          }
        }}
        title="Drag to move · double-click to reset"
        className={
          'flex shrink-0 select-none items-center gap-3 border-b border-border px-4 py-3 ' +
          (dragging ? 'min-[900px]:cursor-grabbing' : 'min-[900px]:cursor-grab')
        }
      >
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
          onClick={toggleExpand}
          aria-pressed={isSized}
          aria-label={isSized ? 'Restore tutor window size' : 'Expand tutor window'}
          title={isSized ? 'Restore size' : 'Expand'}
          className="hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring min-[900px]:flex"
        >
          {isSized ? (
            <Minimize2 className="h-4 w-4" aria-hidden />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={tutor.minimize}
          aria-label="Minimize tutor"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={tutor.close}
          aria-label="Close tutor"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        <ul className="flex flex-col gap-4">
          {messages.map((m) => {
            // Tool-call step ("Retrieving company brief…") — a spinner while
            // running, a check once the model moves on.
            if (m.kind === 'tool') {
              return (
                <li key={m.id} className="flex items-end gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                    <PieMark className="h-4 w-4" />
                  </span>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-surface-sunken px-3.5 py-2.5 text-xs text-text-muted">
                    {m.state === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-deep" aria-hidden />
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
                  <div className="max-w-[85%] break-words rounded-2xl rounded-br-sm bg-highlight/20 px-3.5 py-2.5 text-sm leading-6 text-text">
                    {m.contextSnippet && (
                      <span className="mb-1 flex items-center gap-1 text-xs text-text-subtle">
                        <Sparkles className="h-3 w-3 shrink-0 text-amber-deep" aria-hidden />
                        <span className="italic">
                          Re: &ldquo;{clip(m.contextSnippet, 10)}&rdquo;
                        </span>
                      </span>
                    )}
                    {m.text}
                  </div>
                </li>
              );
            }
            return (
              <li key={m.id} className="flex items-end gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                  <PieMark className="h-4 w-4" />
                </span>
                <div className="max-w-[85%] break-words rounded-2xl rounded-bl-sm bg-surface-sunken px-3.5 py-2.5 text-sm leading-6 text-text">
                  <TutorMarkdown text={m.text} />
                </div>
              </li>
            );
          })}
          {showTyping && (
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

      <div
        ref={composerRef}
        className="shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      >
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

        {limitReached ? (
          <p className="mb-2 text-xs leading-5 text-critique" role="alert">
            You&rsquo;ve reached your daily limit of {MAX_TUTOR_CHATS_PER_DAY} tutor
            chats. It resets at midnight.
          </p>
        ) : showLowHint ? (
          <p className="mb-2 text-xs text-text-subtle" aria-live="polite">
            {remaining} chat{remaining === 1 ? '' : 's'} left today.
          </p>
        ) : null}

        {!limitReached && MAX_MESSAGE_CHARS - text.length <= 40 && (
          <p
            className={
              'mb-1 text-right text-xs tabular-nums ' +
              (text.length >= MAX_MESSAGE_CHARS ? 'text-amber-deep' : 'text-text-subtle')
            }
            aria-live="polite"
          >
            {text.length}/{MAX_MESSAGE_CHARS}
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
            Ask the tutor about this turn
          </label>
          <textarea
            id={`${labelId}-input`}
            ref={taRef}
            rows={1}
            maxLength={MAX_MESSAGE_CHARS}
            value={text}
            disabled={limitReached}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            placeholder={limitReached ? 'Daily chat limit reached' : 'Ask about this turn…'}
            className="max-h-[120px] min-h-[2.5rem] flex-1 resize-none rounded-2xl bg-surface-sunken px-3.5 py-2.5 text-sm leading-6 text-text placeholder:text-text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!text.trim() || isStreaming || limitReached}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-highlight text-primary-700 transition-colors hover:bg-amber-deep disabled:opacity-40 disabled:hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
