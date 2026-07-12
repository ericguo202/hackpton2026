/**
 * RoleSwitcher — Home badge that shows the active target role and, for
 * multi-role candidates, lets them switch which role the next session targets.
 *
 * With a single declared role it renders exactly the old static badge. With
 * more than one, a "Change" link opens a small switch-only popover: one row per
 * role (active on top, tinted, with a check), clicking a non-active row persists
 * it as the active role via `PUT /api/v1/me/target-role`, then refetches `me`.
 * Adding / removing roles is done in Personalize, not here.
 */

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

import { useApi } from '../hooks/useApi';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import type { MeResponse } from '../types/user';

type Props = {
  me: MeResponse;
  refetch: () => Promise<void>;
};

export default function RoleSwitcher({ me, refetch }: Props) {
  const { apiFetch } = useApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeRole = me.target_role;
  const roles = me.target_roles;

  // Close the popover on an outside click or ESC.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!activeRole) return null;

  // One role → the plain, non-interactive badge (a switcher would be useless).
  if (roles.length <= 1) {
    return (
      <p className="text-sm text-text-subtle">
        Target role: <span className="text-text-muted">{activeRole}</span>
      </p>
    );
  }

  // Active role first, then the rest in their declared order.
  const ordered = [activeRole, ...roles.filter((r) => r !== activeRole)];

  async function switchTo(role: string) {
    if (role === activeRole) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/v1/me/target-role', {
        method: 'PUT',
        body: JSON.stringify({ target_role: role }),
      });
      await refetch();
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? extractApiErrorDetail(err)
          : 'Could not switch role. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <p className="text-sm text-text-subtle">
        Target role: <span className="text-text-muted">{activeRole}</span>{' '}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="rounded-sm text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Change
        </button>
      </p>

      {open && (
        <div
          role="listbox"
          aria-label="Switch target role"
          className="absolute left-0 z-20 mt-2 w-64 max-w-[80vw] overflow-hidden rounded-lg border border-border bg-surface-raised p-1"
        >
          {ordered.map((role) => {
            const active = role === activeRole;
            return (
              <button
                key={role}
                type="button"
                role="option"
                aria-selected={active}
                disabled={busy}
                onClick={() => switchTo(role)}
                className={
                  'flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition-colors ' +
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
                  (active
                    ? 'bg-surface-sunken text-text'
                    : 'text-text-muted hover:bg-surface-sunken hover:text-text') +
                  (busy ? ' cursor-wait opacity-70' : '')
                }
              >
                <span className="min-w-0 truncate">{role}</span>
                {active && (
                  <Check className="h-4 w-4 shrink-0 text-link" aria-hidden />
                )}
              </button>
            );
          })}
          {error && (
            <p role="alert" className="px-3 py-1.5 text-xs text-cherry-glaze">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
