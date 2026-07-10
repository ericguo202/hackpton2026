/**
 * MobileSheet — a bottom sheet for the Home setup screen's optional surfaces
 * (Advanced / Privacy) on mobile. The desktop layout uses right-edge drawers
 * (`AdvancedPanelDrawer` / `PrivacyPanelDrawer`); below 900px those same
 * `surface` states open this sheet instead, keeping the primary "Begin
 * session" action anchored underneath.
 *
 * Modeled on `DeliveryConsentDialog`: portal to <body>, backdrop + Escape to
 * close, content stops propagation. Portaling is load-bearing — Home's hero
 * container is `overflow-hidden` and sits under `anim-reveal`/`anim-crossfade`
 * (transformed) ancestors that would otherwise clip / trap a `fixed` element.
 *
 * Mobile-only via `min-[900px]:hidden` on the overlay: on desktop the drawers
 * own the same `surface` state, so a hidden sheet here is inert (its Escape
 * handler, if it ever fired, closes via the same `onClose`).
 */

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './ui/button';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function MobileSheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="anim-crossfade fixed inset-0 z-50 min-[900px]:hidden bg-text/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="anim-sheet-up absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-2xl border-t border-border bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border px-5 pb-4 pt-3">
          <div
            aria-hidden
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong"
          />
          <div className="flex items-center justify-between">
            <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-sm">
              {title}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title.toLowerCase()} settings`}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6">{children}</div>

        <footer className="shrink-0 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" type="button" onClick={onClose} className="w-full">
            Done
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
