/**
 * Temporary smoke-test widget — removes once Part B verification is done.
 *
 * On mount (once Clerk is ready) calls GET /api/v1/me and renders the JSON
 * response. Confirms three things at once: Clerk issues a token, our hook
 * attaches it to the request, and the backend accepts + upserts.
 */

import { useEffect, useState } from 'react';

import { useApi } from '../hooks/useApi';

type MeResponse = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  name: string | null;
  industry: string | null;
  target_role: string | null;
  experience_level: string | null;
  short_bio: string | null;
  completed_registration: boolean;
  created_at: string;
  updated_at: string;
};

export default function MePing() {
  const { apiFetch, isReady } = useApi();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    apiFetch<MeResponse>('/api/v1/me')
      .then((data) => {
        console.log('[MePing] /me response:', data);
        setMe(data);
      })
      .catch((err: Error) => {
        console.error('[MePing] /me failed:', err);
        setError(err.message);
      });
  }, [isReady, apiFetch]);

  if (!isReady) return <div className="text-sm text-gray-500">auth loading…</div>;
  if (error) return <div className="text-sm text-red-600">error: {error}</div>;
  if (!me) return <div className="text-sm text-gray-500">fetching /me…</div>;

  return (
    <pre className="text-xs bg-gray-100 p-2 rounded">
      {JSON.stringify(me, null, 2)}
    </pre>
  );
}
