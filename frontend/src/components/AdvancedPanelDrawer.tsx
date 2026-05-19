/**
 * AdvancedPanelDrawer — desktop wrapper for the Advanced surface.
 *
 * Renders a side panel anchored to the right edge of the hero `relative`
 * container, full hero height. Slides in/out via `translate-x` with a
 * `transition-transform`; always mounted so both directions animate.
 *
 * Closes on the header `X`, the footer `Back`, or `Escape`. Does NOT
 * close on outside-click: the form on the left stays usable while the
 * drawer is open (no backdrop, no focus trap).
 *
 * Desktop-only via `hidden min-[900px]:flex` — the mobile layout uses
 * the pill-tab pattern inside `Home.tsx` instead.
 */

import { X } from 'lucide-react';
import { useEffect } from 'react';

import AdvancedPanel from './AdvancedPanel';
import { FlowHoverButton } from './ui/flow-hover-button';

type Props = {
  open: boolean;
  onClose: () => void;
  voiceId: string | null;
  onVoiceSelect: (id: string | null) => void;
  disabled: boolean;
};

export default function AdvancedPanelDrawer({
  open,
  onClose,
  voiceId,
  onVoiceSelect,
  disabled,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="advanced-panel-title"
      aria-hidden={!open}
      className={[
        'hidden min-[900px]:flex flex-col',
        'absolute inset-y-0 right-0 z-30',
        // 900–1199px: narrower so the h1 + company input on the left stay
        // legible; ≥ 1200px: full 480px.
        'w-[360px] min-[1170px]:w-[480px]',
        'border-l border-border bg-surface-raised shadow-lg',
        'transition-transform duration-300 ease-out',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      ].join(' ')}
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
        <p
          id="advanced-panel-title"
          className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-[13px]"
        >
          Advanced
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close advanced settings"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <AdvancedPanel
          voiceId={voiceId}
          onVoiceSelect={onVoiceSelect}
          disabled={disabled}
        />
      </div>

      <footer className="border-t border-border px-5 py-4 shrink-0">
        <FlowHoverButton variant="dark" type="button" onClick={onClose}>
          Back
        </FlowHoverButton>
      </footer>
    </aside>
  );
}
