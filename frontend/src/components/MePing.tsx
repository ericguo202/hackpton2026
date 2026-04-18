/**
 * Debugging widget — renders the /me JSON so we can eyeball the DB row.
 * Kept in the app permanently as a smoke test; remove before production.
 */

import { useMe } from '../hooks/useMe';

export default function MePing() {
  const { me, error, isReady, isLoading } = useMe();

  if (!isReady || isLoading) {
    return <div className="text-sm text-gray-500">auth loading…</div>;
  }
  if (error) return <div className="text-sm text-red-600">error: {error}</div>;
  if (!me) return <div className="text-sm text-gray-500">fetching /me…</div>;

  return (
    <pre className="text-xs bg-gray-100 p-2 rounded">
      {JSON.stringify(me, null, 2)}
    </pre>
  );
}
