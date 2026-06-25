/**
 * Server-side face/delivery calibration consent (mirror of
 * `deliveryAnalyticsConsent.ts`).
 *
 * The calibration *profile* stays on the device, but consent for it is recorded
 * on the user row so it is demonstrable (GDPR Art. 7(1) / BIPA) and per-user
 * (no leak across accounts that share a browser). `hasActiveFaceCalibrationConsent`
 * encodes the version gate: a stored consent at an older notice version is treated
 * as not-active, which re-prompts on `/calibrate` and triggers clearing the stale
 * local baseline.
 *
 * FACE_CALIBRATION_NOTICE_VERSION mirrors the backend constant in
 * `app/services/face_calibration_consent.py` — bump BOTH when the notice copy
 * changes.
 */

import type { MeResponse } from '../types/user';

export const FACE_CALIBRATION_NOTICE_VERSION = 1 as const;

export function hasActiveFaceCalibrationConsent(
  me: Pick<
    MeResponse,
    | 'face_calibration_consent_at'
    | 'face_calibration_consent_version'
    | 'face_calibration_revoked_at'
  > | null,
): boolean {
  if (!me?.face_calibration_consent_at) return false;
  if (me.face_calibration_consent_version !== FACE_CALIBRATION_NOTICE_VERSION) {
    return false;
  }
  if (!me.face_calibration_revoked_at) return true;

  const consentAt = Date.parse(me.face_calibration_consent_at);
  const revokedAt = Date.parse(me.face_calibration_revoked_at);
  if (Number.isNaN(consentAt)) return false;
  if (Number.isNaN(revokedAt)) return true;
  return revokedAt < consentAt;
}
