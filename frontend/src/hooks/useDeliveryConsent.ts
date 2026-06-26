/**
 * `useDeliveryConsent` — shared grant/revoke for server-stored delivery
 * analytics, lifted out of `Home.tsx` so both the setup-screen Privacy panel
 * and the `/settings` Privacy tab drive the same PUT/DELETE
 * `/api/v1/me/delivery-analytics-consent` flow.
 *
 * Self-contained: it owns its own `useMe()`/`useApi()`. A successful
 * grant/revoke calls `refetch()`, which broadcasts the fresh `me` row to every
 * other live `useMe()` instance (see `useMe.ts`), so a toggle on the settings
 * page is reflected on Home (and vice versa) without prop threading.
 */

import { useState } from 'react';

import { useApi } from './useApi';
import { useMe } from './useMe';
import { trackEvent } from '../lib/analytics';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import {
  DELIVERY_ANALYTICS_NOTICE_VERSION,
  hasActiveDeliveryAnalyticsConsent,
} from '../lib/deliveryAnalyticsConsent';
import type { MeResponse } from '../types/user';

/** "Consented <date>" label for the active-consent badge. */
function formatConsentDate(iso: string): string {
  try {
    return `Consented ${new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}`;
  } catch {
    return 'Delivery analytics consent is active';
  }
}

export function useDeliveryConsent() {
  const { me, refetch: refetchMe } = useMe();
  const { apiFetch } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = hasActiveDeliveryAnalyticsConsent(me);
  const label = me?.delivery_analytics_consent_at
    ? formatConsentDate(me.delivery_analytics_consent_at)
    : null;

  // PUT consent → refetch `me`. Returns whether it succeeded so callers can
  // chain session creation only on success.
  async function grant(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<MeResponse>('/api/v1/me/delivery-analytics-consent', {
        method: 'PUT',
        body: JSON.stringify({
          notice_version: DELIVERY_ANALYTICS_NOTICE_VERSION,
          accepted: true,
        }),
      });
      await refetchMe();
      trackEvent('delivery_analytics_consent_granted');
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError ? extractApiErrorDetail(err) : (err as Error).message,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<MeResponse>('/api/v1/me/delivery-analytics-consent', {
        method: 'DELETE',
      });
      await refetchMe();
      trackEvent('delivery_analytics_consent_revoked');
    } catch (err) {
      setError(
        err instanceof ApiError ? extractApiErrorDetail(err) : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return { active, label, busy, error, setError, grant, revoke };
}
