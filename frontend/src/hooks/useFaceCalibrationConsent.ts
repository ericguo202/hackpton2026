/**
 * `useFaceCalibrationConsent` — grant/revoke for the server-stored face
 * calibration consent, mirroring `useDeliveryConsent`.
 *
 * Self-contained: owns its own `useMe()`/`useApi()`. A successful grant/revoke
 * calls `refetch()`, which broadcasts the fresh `me` to every other live
 * `useMe()` instance, so the `/calibrate` page and the `/settings` receipt stay
 * in sync without prop threading.
 *
 * Unlike delivery analytics, there is no server-side artifact — the calibration
 * profile lives only in the browser. So `revoke()` also clears the local
 * baseline for the current user (the server DELETE just stamps the revocation).
 * `grant()` does NOT touch the local profile; the capture flow on `/calibrate`
 * writes it.
 */

import { useState } from 'react';

import { useApi } from './useApi';
import { useMe } from './useMe';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import { clearFaceCalibration } from '../lib/faceCalibration';
import {
  FACE_CALIBRATION_NOTICE_VERSION,
  hasActiveFaceCalibrationConsent,
} from '../lib/faceCalibrationConsent';
import type { MeResponse } from '../types/user';

export function useFaceCalibrationConsent() {
  const { me, refetch: refetchMe } = useMe();
  const { apiFetch } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = hasActiveFaceCalibrationConsent(me);

  // PUT consent → refetch `me`. Returns whether it succeeded so the calibration
  // page can gate enabling the camera only on success.
  async function grant(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<MeResponse>('/api/v1/me/face-calibration-consent', {
        method: 'PUT',
        body: JSON.stringify({
          notice_version: FACE_CALIBRATION_NOTICE_VERSION,
          accepted: true,
        }),
      });
      await refetchMe();
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

  async function revoke(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<MeResponse>('/api/v1/me/face-calibration-consent', {
        method: 'DELETE',
      });
      // No server-side artifact — clear the on-device baseline for this user.
      if (me?.clerk_user_id) clearFaceCalibration(me.clerk_user_id);
      await refetchMe();
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

  return { active, busy, error, setError, grant, revoke };
}
