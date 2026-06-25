/**
 * Browser-local delivery calibration profile.
 *
 * The profile is a small set of aggregate face-geometry ratios used by
 * `faceHeuristics.ts`; no image, video frame, or raw MediaPipe landmark list is
 * retained. It intentionally stays on the candidate's device.
 *
 * The storage key is NAMESPACED by Clerk user id (`face_delivery_calibration:<userId>`)
 * so two people sharing a browser don't inherit each other's baseline. Consent
 * for calibration is NO LONGER stored here — it lives server-side on the user
 * row (see `faceCalibrationConsent.ts` + `useFaceCalibrationConsent.ts`), which
 * makes it demonstrable (GDPR Art. 7(1) / BIPA) and per-user. When consent is
 * not active (never granted, revoked, or a stale notice version), callers clear
 * the local baseline.
 */

export const FACE_CALIBRATION_STORAGE_PREFIX = 'face_delivery_calibration';
export const FACE_CALIBRATION_VERSION = 1 as const;

// Legacy un-namespaced keys from before consent moved server-side + the profile
// key was scoped per user. `clearLegacyFaceCalibration()` removes them so a
// shared-browser user can't inherit the old global baseline/consent.
const LEGACY_PROFILE_KEY = 'face_delivery_calibration';
const LEGACY_CONSENT_KEY = 'face_delivery_calibration_consent';

function storageKey(userId: string): string {
  return `${FACE_CALIBRATION_STORAGE_PREFIX}:${userId}`;
}

export type FaceCalibrationProfile = {
  version: typeof FACE_CALIBRATION_VERSION;
  calibratedAt: string;
  sampleCount: number;
  leftGazeTarget: number;
  rightGazeTarget: number;
  headYawTarget: number;
  midpointTarget: number;
  verticalPostureTarget: number;
  headTiltTargetDegrees: number;
  smileBaseline: number;
  opennessBaseline: number;
  browBaseline: number;
};

const NUMBER_KEYS: ReadonlyArray<keyof FaceCalibrationProfile> = [
  'sampleCount',
  'leftGazeTarget',
  'rightGazeTarget',
  'headYawTarget',
  'midpointTarget',
  'verticalPostureTarget',
  'headTiltTargetDegrees',
  'smileBaseline',
  'opennessBaseline',
  'browBaseline',
];

export function isFaceCalibrationProfile(
  value: unknown,
): value is FaceCalibrationProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FaceCalibrationProfile>;
  return (
    candidate.version === FACE_CALIBRATION_VERSION &&
    typeof candidate.calibratedAt === 'string' &&
    candidate.calibratedAt.length > 0 &&
    NUMBER_KEYS.every((key) => Number.isFinite(candidate[key])) &&
    Number.isInteger(candidate.sampleCount) &&
    (candidate.sampleCount ?? 0) > 0
  );
}

export function readFaceCalibration(
  userId: string,
): FaceCalibrationProfile | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const stored = window.localStorage.getItem(storageKey(userId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isFaceCalibrationProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeFaceCalibration(
  userId: string,
  profile: FaceCalibrationProfile,
): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(profile));
    return true;
  } catch {
    // Storage may be blocked or full. The calibration page surfaces a retry
    // message so it never claims a profile will be used when it was not saved.
    return false;
  }
}

export function clearFaceCalibration(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Treat disabled storage as already clear.
  }
}

/** Remove the pre-namespacing global profile + the old browser-local consent. */
export function clearLegacyFaceCalibration(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_PROFILE_KEY);
    window.localStorage.removeItem(LEGACY_CONSENT_KEY);
  } catch {
    // Treat disabled storage as already clear.
  }
}
