/**
 * Browser-local delivery calibration profile.
 *
 * Calibration intentionally stays on the candidate's device. The profile is
 * a small set of aggregate face-geometry ratios used by `faceHeuristics.ts`;
 * no image, video frame, or raw MediaPipe landmark list is retained. Because
 * nothing leaves the device, consent for it is also stored locally (no
 * server-side record needed — there is no server-side artifact to prove
 * consent for, unlike `deliveryAnalyticsConsent.ts`).
 */

export const FACE_CALIBRATION_STORAGE_KEY = 'face_delivery_calibration';
export const FACE_CALIBRATION_VERSION = 1 as const;
export const FACE_CALIBRATION_CONSENT_STORAGE_KEY =
  'face_delivery_calibration_consent';
// Consent NOTICE version. Load-bearing for re-consent: `isFaceCalibrationConsent`
// requires a stored consent's `version` to equal this exact value, so BUMP THIS
// whenever the calibration privacy notice text in Calibration.tsx changes —
// stored consent at an older version is then treated as not-consented and the
// user is re-prompted before the camera can be enabled again. (The server-side
// delivery-analytics consent has the same contract via
// DELIVERY_ANALYTICS_NOTICE_VERSION in the backend.)
export const FACE_CALIBRATION_CONSENT_VERSION = 1 as const;

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

export type FaceCalibrationConsent = {
  version: typeof FACE_CALIBRATION_CONSENT_VERSION;
  acceptedAt: string;
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

export function readFaceCalibration(): FaceCalibrationProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(FACE_CALIBRATION_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isFaceCalibrationProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isFaceCalibrationConsent(
  value: unknown,
): value is FaceCalibrationConsent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FaceCalibrationConsent>;
  return (
    candidate.version === FACE_CALIBRATION_CONSENT_VERSION &&
    typeof candidate.acceptedAt === 'string' &&
    candidate.acceptedAt.length > 0
  );
}

export function createFaceCalibrationConsent(): FaceCalibrationConsent {
  return {
    version: FACE_CALIBRATION_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
  };
}

export function readFaceCalibrationConsent(): FaceCalibrationConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(
      FACE_CALIBRATION_CONSENT_STORAGE_KEY,
    );
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isFaceCalibrationConsent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeFaceCalibrationConsent(
  consent: FaceCalibrationConsent,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(
      FACE_CALIBRATION_CONSENT_STORAGE_KEY,
      JSON.stringify(consent),
    );
    return true;
  } catch {
    return false;
  }
}

export function writeFaceCalibration(profile: FaceCalibrationProfile): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(
      FACE_CALIBRATION_STORAGE_KEY,
      JSON.stringify(profile),
    );
    return true;
  } catch {
    // Storage may be blocked or full. The calibration page surfaces a retry
    // message so it never claims a profile will be used when it was not saved.
    return false;
  }
}

export function clearFaceCalibration(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FACE_CALIBRATION_STORAGE_KEY);
  } catch {
    // Treat disabled storage as already clear.
  }
}

export function clearFaceCalibrationConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FACE_CALIBRATION_CONSENT_STORAGE_KEY);
  } catch {
    // Treat disabled storage as already clear.
  }
}
