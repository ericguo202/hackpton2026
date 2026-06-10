/**
 * Clickwrap acceptance of the Terms of Service + Privacy Policy.
 *
 * These version constants are hand-mirrored from the backend source of truth
 * (`backend/app/services/policy_versions.py`). Keep the two in sync — same
 * discipline as `DELIVERY_ANALYTICS_NOTICE_VERSION`. Bump a constant (in BOTH
 * places) when a policy materially changes; every user whose stored accepted
 * version is now behind it is re-prompted by the forced acceptance gate.
 */

import type { MeResponse } from '../types/user';

export const CURRENT_TERMS_VERSION = 1 as const;
export const CURRENT_PRIVACY_VERSION = 1 as const;

type AcceptanceFields = Pick<
  MeResponse,
  'terms_accepted_version' | 'privacy_accepted_version'
>;

/** Which of the two documents the user still owes acceptance for. */
export function whatChanged(me: AcceptanceFields): {
  terms: boolean;
  privacy: boolean;
} {
  return {
    terms: me.terms_accepted_version !== CURRENT_TERMS_VERSION,
    privacy: me.privacy_accepted_version !== CURRENT_PRIVACY_VERSION,
  };
}

/** True when either policy version is missing or behind the current version. */
export function needsPolicyAcceptance(me: AcceptanceFields | null): boolean {
  if (!me) return false;
  const changed = whatChanged(me);
  return changed.terms || changed.privacy;
}

/**
 * Record affirmative acceptance of the current Terms + Privacy versions. The
 * server stamps a per-version timestamp (the enforceable clickwrap record) and
 * returns the refreshed user row.
 */
export function recordPolicyAcceptance(
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>,
): Promise<MeResponse> {
  return apiFetch<MeResponse>('/api/v1/me/policy-acceptance', {
    method: 'PUT',
    body: JSON.stringify({
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      accepted: true,
    }),
  });
}
