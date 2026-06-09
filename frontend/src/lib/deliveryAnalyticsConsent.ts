import type { MeResponse } from '../types/user';

export const DELIVERY_ANALYTICS_NOTICE_VERSION = 1 as const;

export function hasActiveDeliveryAnalyticsConsent(
  me: Pick<
    MeResponse,
    | 'delivery_analytics_consent_at'
    | 'delivery_analytics_consent_version'
    | 'delivery_analytics_revoked_at'
  > | null,
): boolean {
  if (!me?.delivery_analytics_consent_at) return false;
  if (me.delivery_analytics_consent_version !== DELIVERY_ANALYTICS_NOTICE_VERSION) {
    return false;
  }
  if (!me.delivery_analytics_revoked_at) return true;

  const consentAt = Date.parse(me.delivery_analytics_consent_at);
  const revokedAt = Date.parse(me.delivery_analytics_revoked_at);
  if (Number.isNaN(consentAt)) return false;
  if (Number.isNaN(revokedAt)) return true;
  return revokedAt < consentAt;
}
