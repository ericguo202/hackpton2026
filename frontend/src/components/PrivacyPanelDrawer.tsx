/**
 * PrivacyPanelDrawer — desktop wrapper for the "Privacy" surface, a sibling of
 * `AdvancedPanelDrawer`. Same right-edge slide-in panel, ESC/Back to close, no
 * backdrop or focus trap (the form on the left stays usable). Hosts
 * `PrivacyPanel` (delivery-analytics consent grant/revoke).
 *
 * Desktop-only via `hidden min-[900px]:flex`; the mobile layout reaches the
 * same `PrivacyPanel` through the third pill tab in `Home.tsx`.
 */

import { X } from 'lucide-react';
import { useEffect } from 'react';

import PrivacyPanel from './PrivacyPanel';
import { FlowHoverButton } from './ui/flow-hover-button';

type Props = {
  open: boolean;
  onClose: () => void;
  active: boolean;
  busy: boolean;
  error: string | null;
  consentLabel: string | null;
  onGrant: () => void;
  onRevoke: () => void;
};

export default function PrivacyPanelDrawer({
  open,
  onClose,
  active,
  busy,
  error,
  consentLabel,
  onGrant,
  onRevoke,
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
      aria-labelledby="privacy-panel-title"
      aria-hidden={!open}
      className={[
        'hidden min-[900px]:flex flex-col',
        'absolute inset-y-0 right-0 z-30',
        'w-[360px] min-[1170px]:w-[480px]',
        'border-l border-border bg-surface-raised shadow-lg',
        'transition-transform duration-300 ease-out',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      ].join(' ')}
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
        <p
          id="privacy-panel-title"
          className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-sm"
        >
          Privacy
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close privacy settings"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <PrivacyPanel
          active={active}
          busy={busy}
          error={error}
          consentLabel={consentLabel}
          onGrant={onGrant}
          onRevoke={onRevoke}
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
