/**
 * Debugging widget — renders the /me JSON so we can eyeball the DB row.
 * Kept in the app permanently as a smoke test; remove before production.
 */

import { useMe } from '../hooks/useMe';

export default function MePing() {
  const { me, error, isReady, isLoading } = useMe();

  if (!isReady || isLoading) {
    return <div className="text-sm text-text-muted">auth loading…</div>;
  }
  if (error) return <div className="text-sm text-accent">error: {error}</div>;
  if (!me) return <div className="text-sm text-text-muted">fetching /me…</div>;

  return (
    <pre className="text-xs bg-surface-sunken text-text p-2 rounded">
      {JSON.stringify(me, null, 2)}
    </pre>
  );
}
