/**
 * TypeScript port of the scoring heuristics in `backend/opencv.py`.
 *
 * Contract: accept pixel-space face-landmark points (same indexing as
 * MediaPipe's canonical 468-point mesh + 10 iris points 468-477) and
 * return the same shape the desktop script dumps to
 * `backend/interview_feedback_latest.json`. The browser pipeline calls
 * `new FrameSummary()` once per turn, feeds `.update(pointsPx)` every
 * analyzer frame, then `.buildSummary()` right before submitting the
 * turn — the JSON is batched into the turn POST as the `cv_summary`
 * multipart field. Numerical parity with the Python version matters
 * because the evaluator prompt was tuned against that output.
 *
 * The constants below remain the no-calibration fallback. When the user has
 * completed the browser-local delivery calibration flow, a bounded profile
 * adjusts camera-relative and face-geometry baselines without retaining raw
 * landmarks or changing the summary contract consumed by the backend.
 */

import {
  FACE_CALIBRATION_VERSION,
  type FaceCalibrationProfile,
} from './faceCalibration';
import type { CaptureMode } from './captureMode';

export type Point = readonly [number, number];

// ── MediaPipe landmark indices (match opencv.py L292-L312) ────────────────────
export const LEFT_EYE_OUTER = 33;
export const LEFT_EYE_INNER = 133;
export const RIGHT_EYE_INNER = 362;
export const RIGHT_EYE_OUTER = 263;
export const LEFT_EYE_TOP = 159;
export const LEFT_EYE_BOTTOM = 145;
export const RIGHT_EYE_TOP = 386;
export const RIGHT_EYE_BOTTOM = 374;
export const LEFT_IRIS = [468, 469, 470, 471, 472] as const;
export const RIGHT_IRIS = [473, 474, 475, 476, 477] as const;
export const NOSE_TIP = 1;
export const FACE_LEFT = 234;
export const FACE_RIGHT = 454;
export const FOREHEAD = 10;
export const CHIN = 152;
export const MOUTH_LEFT = 61;
export const MOUTH_RIGHT = 291;
export const UPPER_LIP = 13;
export const LOWER_LIP = 14;
export const LEFT_BROW = 105;
export const RIGHT_BROW = 334;

// ── Tunable defaults (opencv.py L442-L468) ────────────────────────────────────
const EYE_LEFT_CENTER_WEIGHT = 0.25;
const EYE_RIGHT_CENTER_WEIGHT = 0.25;
const EYE_HEAD_ALIGNMENT_WEIGHT = 0.25;
const EYE_MIDPOINT_WEIGHT = 0.15;
const EYE_POSTURE_WEIGHT = 0.05;
const EYE_BALANCE_WEIGHT = 0.05;
const EYE_CENTER_TARGET = 0.5;
const EYE_CENTER_SENSITIVITY = 200.0;
const HEAD_ALIGNMENT_SENSITIVITY = 100.0;
const MIDPOINT_SENSITIVITY = 100.0;
const POSTURE_SENSITIVITY = 70.0;
const SMILE_BASELINE = 0.28;
const SMILE_GAIN = 420.0;
const OPENNESS_BASELINE = 0.028;
const OPENNESS_GAIN = 1800.0;
const BROW_BASELINE = 0.32;
const BROW_GAIN = 320.0;
const TENSION_BASELINE = 0.08;
const TENSION_GAIN = 900.0;
const EXPR_SMILE_WEIGHT = 0.45;
const EXPR_OPENNESS_WEIGHT = 0.30;
const EXPR_BROW_WEIGHT = 0.25;

const EMA_ALPHA = 0.12;
const EMA_SEED = 50.0;

const LOOKED_AWAY_EYE_THRESHOLD = 60;
const POSTURE_HEAD_ALIGNMENT_MIN = 62;
const POSTURE_VERTICAL_MAX = 0.22;
const POSTURE_MIDPOINT_MAX = 0.20;
const POSTURE_TILT_TOLERANCE_DEGREES = 4;
const POSTURE_TILT_FLAG_DEGREES = 9;
const POSTURE_TILT_SENSITIVITY = 7.5;
const POSTURE_SCORE_MIN = 68;
const POSTURE_HEAD_ALIGNMENT_WEIGHT = 0.30;
const POSTURE_VERTICAL_WEIGHT = 0.25;
const POSTURE_MIDPOINT_WEIGHT = 0.20;
const POSTURE_TILT_WEIGHT = 0.25;
// "Low energy" should mean clearly flat, not merely neutral. The old rule
// effectively reduced to `smileScore < 40` because normal speaking-mouth
// ratios are almost always below 0.15, which flagged calm candidates through
// nearly an entire answer. Require all three weak-expression signals instead.
const LOW_ENERGY_EXPRESSION_MAX = 32;
const LOW_ENERGY_SMILE_MAX = 20;
const LOW_ENERGY_MOUTH_OPEN_MAX = 0.028;

export const FACE_CALIBRATION_MIN_SAMPLES = 36;

type CalibrationFeatures = {
  leftGazeRatio: number;
  rightGazeRatio: number;
  headYawOffset: number;
  midpointOffset: number;
  verticalPosture: number;
  headTiltDegrees: number;
  smileRatio: number;
  eyeOpenRatio: number;
  browRelaxRatio: number;
};

// ── small helpers ─────────────────────────────────────────────────────────────
export function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function scoreBand(score: number): 'strong' | 'good' | 'fair' | 'needs work' {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'needs work';
}

function percentage(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

function scoreStability(samples: number[]): number {
  if (samples.length < 2) return 100;

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return clamp(100 - Math.sqrt(variance) * 1.6);
}

/**
 * Average face-visible quality across the whole turn while discarding the
 * highest/lowest 10% once enough samples exist. The trim removes isolated
 * landmark spikes without hiding sustained issues, which are still captured
 * by the coverage and streak counters.
 */
function robustMean(samples: number[], fallback: number): number {
  if (samples.length === 0) return fallback;

  const sorted = [...samples].sort((a, b) => a - b);
  const trim = sorted.length >= 20 ? Math.floor(sorted.length * 0.1) : 0;
  const kept = trim > 0 ? sorted.slice(trim, sorted.length - trim) : sorted;
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

function meanPoint(points: Point[], indices: readonly number[]): Point {
  let sx = 0;
  let sy = 0;
  for (const i of indices) {
    sx += points[i][0];
    sy += points[i][1];
  }
  return [sx / indices.length, sy / indices.length];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function safeRatio(num: number, den: number): number {
  return den ? num / den : 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function featureMedian(
  features: CalibrationFeatures[],
  key: keyof CalibrationFeatures,
): number {
  return median(features.map((feature) => feature[key]));
}

function extractCalibrationFeatures(points: Point[]): CalibrationFeatures {
  const leftOuter = points[LEFT_EYE_OUTER];
  const leftInner = points[LEFT_EYE_INNER];
  const rightInner = points[RIGHT_EYE_INNER];
  const rightOuter = points[RIGHT_EYE_OUTER];
  const leftIris = meanPoint(points, LEFT_IRIS);
  const rightIris = meanPoint(points, RIGHT_IRIS);
  const noseTip = points[NOSE_TIP];
  const faceLeft = points[FACE_LEFT];
  const faceRight = points[FACE_RIGHT];
  const forehead = points[FOREHEAD];
  const chin = points[CHIN];
  const mouthLeft = points[MOUTH_LEFT];
  const mouthRight = points[MOUTH_RIGHT];
  const leftBrow = points[LEFT_BROW];
  const rightBrow = points[RIGHT_BROW];
  const leftEyeTop = points[LEFT_EYE_TOP];
  const leftEyeBottom = points[LEFT_EYE_BOTTOM];
  const rightEyeTop = points[RIGHT_EYE_TOP];
  const rightEyeBottom = points[RIGHT_EYE_BOTTOM];

  const faceWidth = distance(faceLeft, faceRight);
  const faceHeight = distance(forehead, chin);
  const faceMidX = (faceLeft[0] + faceRight[0]) / 2;
  const eyeMidX = (leftIris[0] + rightIris[0]) / 2;
  const leftEyeOpen = distance(leftEyeTop, leftEyeBottom);
  const rightEyeOpen = distance(rightEyeTop, rightEyeBottom);

  return {
    leftGazeRatio: safeRatio(
      leftIris[0] - leftOuter[0],
      Math.max(leftInner[0] - leftOuter[0], 1),
    ),
    rightGazeRatio: Math.abs(
      safeRatio(
        rightIris[0] - rightInner[0],
        Math.min(rightOuter[0] - rightInner[0], -1),
      ),
    ),
    headYawOffset:
      (noseTip[0] - faceMidX) / Math.max(faceWidth * 0.5, 1),
    midpointOffset:
      (eyeMidX - faceMidX) / Math.max(faceWidth * 0.5, 1),
    verticalPosture:
      (noseTip[1] - (forehead[1] + chin[1]) / 2) /
      Math.max(faceHeight * 0.5, 1),
    headTiltDegrees:
      (Math.atan2(
        rightOuter[1] - leftOuter[1],
        Math.abs(rightOuter[0] - leftOuter[0]),
      ) *
        180) /
      Math.PI,
    smileRatio: safeRatio(distance(mouthLeft, mouthRight), Math.max(faceWidth, 1)),
    eyeOpenRatio: safeRatio(
      (leftEyeOpen + rightEyeOpen) / 2,
      Math.max(faceWidth, 1),
    ),
    browRelaxRatio: safeRatio(
      distance(leftBrow, rightBrow),
      Math.max(faceWidth, 1),
    ),
  };
}

/**
 * Reduce a short neutral-camera capture to a bounded browser-local profile.
 *
 * Bounded adjustments are deliberate: calibration accounts for camera angle
 * and natural face geometry, but cannot normalize a sustained looked-away or
 * tilted pose into a perfect score.
 */
export function buildFaceCalibration(
  samples: Point[][],
): FaceCalibrationProfile {
  if (samples.length < FACE_CALIBRATION_MIN_SAMPLES) {
    throw new Error(
      `Need at least ${FACE_CALIBRATION_MIN_SAMPLES} visible-face samples.`,
    );
  }

  const features = samples.map(extractCalibrationFeatures);
  return {
    version: FACE_CALIBRATION_VERSION,
    calibratedAt: new Date().toISOString(),
    sampleCount: samples.length,
    leftGazeTarget: clamp(
      featureMedian(features, 'leftGazeRatio'),
      EYE_CENTER_TARGET - 0.12,
      EYE_CENTER_TARGET + 0.12,
    ),
    rightGazeTarget: clamp(
      featureMedian(features, 'rightGazeRatio'),
      EYE_CENTER_TARGET - 0.12,
      EYE_CENTER_TARGET + 0.12,
    ),
    headYawTarget: clamp(featureMedian(features, 'headYawOffset'), -0.16, 0.16),
    midpointTarget: clamp(featureMedian(features, 'midpointOffset'), -0.12, 0.12),
    verticalPostureTarget: clamp(
      featureMedian(features, 'verticalPosture'),
      -0.18,
      0.18,
    ),
    headTiltTargetDegrees: clamp(
      featureMedian(features, 'headTiltDegrees'),
      -6,
      6,
    ),
    smileBaseline: clamp(
      featureMedian(features, 'smileRatio') - 52 / SMILE_GAIN,
      SMILE_BASELINE - 0.045,
      SMILE_BASELINE + 0.045,
    ),
    opennessBaseline: clamp(
      featureMedian(features, 'eyeOpenRatio') - 58 / OPENNESS_GAIN,
      OPENNESS_BASELINE - 0.015,
      OPENNESS_BASELINE + 0.015,
    ),
    browBaseline: clamp(
      featureMedian(features, 'browRelaxRatio') - 58 / BROW_GAIN,
      BROW_BASELINE - 0.05,
      BROW_BASELINE + 0.05,
    ),
  };
}

// ── scoring ───────────────────────────────────────────────────────────────────
export interface EyeContactResult {
  score: number;
  label: 'direct eye contact' | 'mostly engaged' | 'drifting gaze' | 'avoidant gaze';
  headAlignmentScore: number;
  verticalPosture: number;
  midpointOffset: number;
  postureScore: number;
  headTiltDegrees: number;
  headTiltScore: number;
}

/**
 * Ported from `InterviewAnalyzer._score_eye_contact` (opencv.py L590).
 * The returned auxiliary metrics are what `current_issues` reads from
 * `last_metrics` on the Python side — we expose them directly instead.
 */
export function scoreEyeContact(
  points: Point[],
  calibration: FaceCalibrationProfile | null = null,
): EyeContactResult {
  const leftOuter = points[LEFT_EYE_OUTER];
  const leftInner = points[LEFT_EYE_INNER];
  const rightInner = points[RIGHT_EYE_INNER];
  const rightOuter = points[RIGHT_EYE_OUTER];
  const leftIris = meanPoint(points, LEFT_IRIS);
  const rightIris = meanPoint(points, RIGHT_IRIS);
  const noseTip = points[NOSE_TIP];
  const faceLeft = points[FACE_LEFT];
  const faceRight = points[FACE_RIGHT];
  const forehead = points[FOREHEAD];
  const chin = points[CHIN];

  const leftEyeWidth = distance(leftOuter, leftInner);
  const rightEyeWidth = distance(rightOuter, rightInner);
  const faceWidth = distance(faceLeft, faceRight);
  const faceHeight = distance(forehead, chin);
  const rawHeadTiltDegrees =
    (Math.atan2(
      rightOuter[1] - leftOuter[1],
      Math.abs(rightOuter[0] - leftOuter[0]),
    ) *
      180) /
    Math.PI;
  const headTiltDegrees = Math.abs(
    rawHeadTiltDegrees - (calibration?.headTiltTargetDegrees ?? 0),
  );

  // Parity note: Python uses `min(right_outer[0] - right_inner[0], -1)`
  // for the denominator so the ratio stays negative, then takes abs().
  // We mirror that exactly.
  const leftGazeRatio = safeRatio(
    leftIris[0] - leftOuter[0],
    Math.max(leftInner[0] - leftOuter[0], 1),
  );
  const rightGazeRatioSigned = safeRatio(
    rightIris[0] - rightInner[0],
    Math.min(rightOuter[0] - rightInner[0], -1),
  );
  const rightGazeRatio = Math.abs(rightGazeRatioSigned);

  const leftCenterScore =
    100 -
    Math.abs(leftGazeRatio - (calibration?.leftGazeTarget ?? EYE_CENTER_TARGET)) *
      EYE_CENTER_SENSITIVITY;
  const rightCenterScore =
    100 -
    Math.abs(rightGazeRatio - (calibration?.rightGazeTarget ?? EYE_CENTER_TARGET)) *
      EYE_CENTER_SENSITIVITY;

  const eyeMidX = (leftIris[0] + rightIris[0]) / 2;
  const faceMidX = (faceLeft[0] + faceRight[0]) / 2;
  const rawHeadYawOffset =
    (noseTip[0] - faceMidX) / Math.max(faceWidth * 0.5, 1);
  const rawMidpointOffset =
    (eyeMidX - faceMidX) / Math.max(faceWidth * 0.5, 1);
  const rawVerticalPosture =
    (noseTip[1] - (forehead[1] + chin[1]) / 2) /
    Math.max(faceHeight * 0.5, 1);
  const headYawOffset = Math.abs(
    rawHeadYawOffset - (calibration?.headYawTarget ?? 0),
  );
  const midpointOffset = Math.abs(
    rawMidpointOffset - (calibration?.midpointTarget ?? 0),
  );
  const verticalPosture = Math.abs(
    rawVerticalPosture - (calibration?.verticalPostureTarget ?? 0),
  );
  const eyeSizeBalance =
    100 -
    (Math.abs(leftEyeWidth - rightEyeWidth) / Math.max(Math.max(leftEyeWidth, rightEyeWidth), 1)) *
      100;

  const headAlignmentScore = 100 - headYawOffset * HEAD_ALIGNMENT_SENSITIVITY;
  const midpointScore = 100 - midpointOffset * MIDPOINT_SENSITIVITY;
  const verticalPostureScore = 100 - verticalPosture * POSTURE_SENSITIVITY;
  const headTiltScore =
    100 -
    Math.max(0, headTiltDegrees - POSTURE_TILT_TOLERANCE_DEGREES) *
      POSTURE_TILT_SENSITIVITY;
  const postureScore = clamp(
    clamp(headAlignmentScore) * POSTURE_HEAD_ALIGNMENT_WEIGHT +
      clamp(verticalPostureScore) * POSTURE_VERTICAL_WEIGHT +
      clamp(midpointScore) * POSTURE_MIDPOINT_WEIGHT +
      clamp(headTiltScore) * POSTURE_TILT_WEIGHT,
  );

  const score = clamp(
    clamp(leftCenterScore) * EYE_LEFT_CENTER_WEIGHT +
      clamp(rightCenterScore) * EYE_RIGHT_CENTER_WEIGHT +
      clamp(headAlignmentScore) * EYE_HEAD_ALIGNMENT_WEIGHT +
      clamp(midpointScore) * EYE_MIDPOINT_WEIGHT +
      clamp(verticalPostureScore) * EYE_POSTURE_WEIGHT +
      clamp(eyeSizeBalance) * EYE_BALANCE_WEIGHT,
  );

  let label: EyeContactResult['label'];
  if (score >= 82) label = 'direct eye contact';
  else if (score >= 64) label = 'mostly engaged';
  else if (score >= 45) label = 'drifting gaze';
  else label = 'avoidant gaze';

  return {
    score,
    label,
    headAlignmentScore: clamp(headAlignmentScore),
    verticalPosture,
    midpointOffset,
    postureScore,
    headTiltDegrees,
    headTiltScore: clamp(headTiltScore),
  };
}

export interface ExpressionResult {
  score: number;
  label: 'engaged expression' | 'professional expression' | 'flat expression' | 'low energy';
  smileScore: number;
  mouthOpenRatio: number;
}

export function isLowEnergyExpression(expression: ExpressionResult): boolean {
  return (
    expression.score < LOW_ENERGY_EXPRESSION_MAX &&
    expression.smileScore < LOW_ENERGY_SMILE_MAX &&
    expression.mouthOpenRatio < LOW_ENERGY_MOUTH_OPEN_MAX
  );
}

/**
 * Ported from `InterviewAnalyzer._score_expression` (opencv.py L670).
 * Auxiliary metrics surfaced for the issue tally (same as Python's
 * `last_metrics` dict).
 */
export function scoreExpression(
  points: Point[],
  calibration: FaceCalibrationProfile | null = null,
): ExpressionResult {
  const mouthLeft = points[MOUTH_LEFT];
  const mouthRight = points[MOUTH_RIGHT];
  const upperLip = points[UPPER_LIP];
  const lowerLip = points[LOWER_LIP];
  const leftBrow = points[LEFT_BROW];
  const rightBrow = points[RIGHT_BROW];
  const leftEyeTop = points[LEFT_EYE_TOP];
  const leftEyeBottom = points[LEFT_EYE_BOTTOM];
  const rightEyeTop = points[RIGHT_EYE_TOP];
  const rightEyeBottom = points[RIGHT_EYE_BOTTOM];
  const faceLeft = points[FACE_LEFT];
  const faceRight = points[FACE_RIGHT];

  const faceWidth = distance(faceLeft, faceRight);
  const mouthWidth = distance(mouthLeft, mouthRight);
  const mouthOpen = distance(upperLip, lowerLip);
  const browWidth = distance(leftBrow, rightBrow);
  const leftEyeOpen = distance(leftEyeTop, leftEyeBottom);
  const rightEyeOpen = distance(rightEyeTop, rightEyeBottom);

  const smileRatio = safeRatio(mouthWidth, Math.max(faceWidth, 1));
  const mouthOpenRatio = safeRatio(mouthOpen, Math.max(faceWidth, 1));
  const eyeOpenRatio = safeRatio((leftEyeOpen + rightEyeOpen) / 2, Math.max(faceWidth, 1));
  const browRelaxRatio = safeRatio(browWidth, Math.max(faceWidth, 1));

  const smileScore = clamp(
    (smileRatio - (calibration?.smileBaseline ?? SMILE_BASELINE)) * SMILE_GAIN,
  );
  const opennessScore = clamp(
    (eyeOpenRatio - (calibration?.opennessBaseline ?? OPENNESS_BASELINE)) *
      OPENNESS_GAIN,
  );
  const relaxedBrowScore = clamp(
    (browRelaxRatio - (calibration?.browBaseline ?? BROW_BASELINE)) * BROW_GAIN,
  );
  const overTensionPenalty = clamp(
    (mouthOpenRatio - TENSION_BASELINE) * TENSION_GAIN,
    0,
    30,
  );

  const score = clamp(
    smileScore * EXPR_SMILE_WEIGHT +
      opennessScore * EXPR_OPENNESS_WEIGHT +
      relaxedBrowScore * EXPR_BROW_WEIGHT -
      overTensionPenalty,
  );

  let label: ExpressionResult['label'];
  if (score >= 80) label = 'engaged expression';
  else if (score >= 60) label = 'professional expression';
  else if (score >= 42) label = 'flat expression';
  else label = 'low energy';

  return { score, label, smileScore, mouthOpenRatio };
}

function guidanceText(
  eyeScore: number,
  expressionScore: number,
  eyeLabel: string,
  expressionLabel: string,
  postureScore: number,
  headTiltDegrees: number,
): string {
  if (headTiltDegrees > POSTURE_TILT_FLAG_DEGREES) {
    return 'Level your head with the camera so your posture reads more composed.';
  }
  if (postureScore < POSTURE_SCORE_MIN) {
    return 'Sit upright and keep your head centered while you answer.';
  }
  if (eyeScore < 45) return 'Look a bit closer to the camera and keep your head centered.';
  if (expressionScore < 45) return 'Add a slight smile and keep your eyes more open to look engaged.';
  if (eyeLabel.includes('drifting')) return 'Your gaze is close. Try holding it on the lens a little longer.';
  if (expressionLabel.includes('flat') || expressionLabel.includes('low energy')) {
    return 'Relax your face and add a little warmth between answers.';
  }
  return 'Nice balance. Maintain this level of eye contact and expression.';
}

function summaryGuidance(
  faceVisiblePct: number,
  lookedAwayPct: number,
  badPosturePct: number,
  tiltedPct: number,
  lowEnergyPct: number,
  fallback: string,
): string {
  if (faceVisiblePct < 85) {
    return 'Keep your face centered and fully visible so delivery scoring has a reliable read.';
  }

  const topIssue = [
    {
      pct: lookedAwayPct,
      text: 'Hold your gaze closer to the camera lens for longer stretches.',
    },
    {
      pct: lowEnergyPct,
      text: 'Add a little facial warmth and energy while you explain the answer.',
    },
    {
      pct: Math.max(badPosturePct, tiltedPct),
      text:
        tiltedPct > badPosturePct
          ? 'Keep your head level with the camera instead of tilting through the answer.'
          : 'Sit upright and keep your head centered through the full answer.',
    },
  ].sort((a, b) => b.pct - a.pct)[0];

  if (topIssue.pct >= 12) return topIssue.text;
  return fallback;
}

// ── summary accumulator ───────────────────────────────────────────────────────

/** Shape matches `backend/interview_feedback_latest.json`. Keep the keys
 *  stable — the backend's deterministic delivery scorer reads them by name. */
export interface InterviewSummary {
  /** Capture context is appended by useFaceAnalyzer. Legacy/offline callers
   *  can omit it and retain the desktop scoring path. */
  capture_mode?: CaptureMode;
  capture_width?: number;
  capture_height?: number;
  /** Version 2 adds face-only, full-turn robust quality signals. */
  quality_aggregation_version?: number;
  face_quality_sample_count?: number;
  eye_contact_score_robust?: number;
  expression_score_robust?: number;
  posture_score_robust?: number;
  calibration_applied: boolean;
  calibration_version: number | null;
  calibrated_at: string | null;
  frames_processed: number;
  face_visible_pct: number;
  eye_contact_score: number;
  expression_score: number;
  posture_score: number;
  overall_interview_score: number;
  eye_contact_stability: number;
  expression_stability: number;
  posture_stability: number;
  looked_away_pct: number;
  posture_drift_pct: number;
  bad_posture_pct: number;
  tilted_pct: number;
  low_energy_pct: number;
  longest_looked_away_streak_frames: number;
  longest_posture_drift_streak_frames: number;
  longest_bad_posture_streak_frames: number;
  longest_tilted_streak_frames: number;
  longest_low_energy_streak_frames: number;
  eye_contact_rating: string;
  expression_rating: string;
  posture_rating: string;
  interview_rating: string;
  best_eye_contact_frame_score: number;
  best_expression_frame_score: number;
  best_posture_frame_score: number;
  head_tilt_degrees_avg: number;
  head_tilt_degrees_max: number;
  coaching_tip: string;
  notes: string[];
}

/**
 * Per-turn rolling accumulator — matches the stateful bits of
 * `InterviewAnalyzer` (EMAs, best-frame tracker, face-visible counter,
 * last-guidance string). Issue counts are tallied separately from
 * `current_issues` (opencv.py L753) so the Python side's per-frame
 * overlay coloring has no equivalent here — we only need aggregates.
 */
export class FrameSummary {
  private frameCount = 0;
  private detectedFaceFrames = 0;
  private eyeEma = EMA_SEED;
  private expressionEma = EMA_SEED;
  private postureEma = EMA_SEED;
  private overallEma = EMA_SEED;
  private bestEye = 0;
  private bestExpression = 0;
  private bestPosture = 0;
  private lastGuidance = 'Move into frame so your face is visible.';
  private eyeSamples: number[] = [];
  private expressionSamples: number[] = [];
  private postureSamples: number[] = [];
  private rawEyeSamples: number[] = [];
  private rawExpressionSamples: number[] = [];
  private rawPostureSamples: number[] = [];
  private headTiltSamples: number[] = [];
  private lookedAwayFrames = 0;
  private postureDriftFrames = 0;
  private tiltedFrames = 0;
  private lowEnergyFrames = 0;
  private currentLookedAwayStreak = 0;
  private currentPostureDriftStreak = 0;
  private currentTiltedStreak = 0;
  private currentLowEnergyStreak = 0;
  private longestLookedAwayStreak = 0;
  private longestPostureDriftStreak = 0;
  private longestTiltedStreak = 0;
  private longestLowEnergyStreak = 0;
  private readonly calibration: FaceCalibrationProfile | null;

  constructor(calibration: FaceCalibrationProfile | null = null) {
    this.calibration = calibration;
  }

  private smooth(current: number, next: number): number {
    return clamp((1 - EMA_ALPHA) * current + EMA_ALPHA * next);
  }

  private resetIssueStreaks(): void {
    this.currentLookedAwayStreak = 0;
    this.currentPostureDriftStreak = 0;
    this.currentTiltedStreak = 0;
    this.currentLowEnergyStreak = 0;
  }

  /** Feed the 468+iris landmarks for one frame, in pixel coordinates.
   *  Pass `null` when the detector returned no face. Quality EMAs hold their
   *  last value during detector dropouts; face visibility owns that penalty,
   *  so one missed frame cannot lower the same signal twice. */
  update(points: Point[] | null): void {
    this.frameCount += 1;

    if (!points) {
      this.lastGuidance = 'Center your face in the camera to begin interview scoring.';
      this.resetIssueStreaks();
      return;
    }

    this.detectedFaceFrames += 1;
    const eye = scoreEyeContact(points, this.calibration);
    const expr = scoreExpression(points, this.calibration);
    const overall = clamp(eye.score * 0.65 + expr.score * 0.35);

    this.eyeEma = this.smooth(this.eyeEma, eye.score);
    this.expressionEma = this.smooth(this.expressionEma, expr.score);
    this.postureEma = this.smooth(this.postureEma, eye.postureScore);
    this.overallEma = this.smooth(this.overallEma, overall);
    this.bestEye = Math.max(this.bestEye, eye.score);
    this.bestExpression = Math.max(this.bestExpression, expr.score);
    this.bestPosture = Math.max(this.bestPosture, eye.postureScore);
    this.eyeSamples.push(this.eyeEma);
    this.expressionSamples.push(this.expressionEma);
    this.postureSamples.push(this.postureEma);
    this.rawEyeSamples.push(eye.score);
    this.rawExpressionSamples.push(expr.score);
    this.rawPostureSamples.push(eye.postureScore);
    this.headTiltSamples.push(eye.headTiltDegrees);

    const lookedAway = eye.score < LOOKED_AWAY_EYE_THRESHOLD;
    const tilted = eye.headTiltDegrees > POSTURE_TILT_FLAG_DEGREES;
    const badPosture =
      this.postureEma < POSTURE_SCORE_MIN ||
      tilted ||
      eye.headAlignmentScore < POSTURE_HEAD_ALIGNMENT_MIN ||
      eye.verticalPosture > POSTURE_VERTICAL_MAX ||
      eye.midpointOffset > POSTURE_MIDPOINT_MAX;
    const lowEnergy = isLowEnergyExpression(expr);

    if (lookedAway) {
      this.lookedAwayFrames += 1;
      this.currentLookedAwayStreak += 1;
      this.longestLookedAwayStreak = Math.max(
        this.longestLookedAwayStreak,
        this.currentLookedAwayStreak,
      );
    } else {
      this.currentLookedAwayStreak = 0;
    }

    if (badPosture) {
      this.postureDriftFrames += 1;
      this.currentPostureDriftStreak += 1;
      this.longestPostureDriftStreak = Math.max(
        this.longestPostureDriftStreak,
        this.currentPostureDriftStreak,
      );
    } else {
      this.currentPostureDriftStreak = 0;
    }

    if (tilted) {
      this.tiltedFrames += 1;
      this.currentTiltedStreak += 1;
      this.longestTiltedStreak = Math.max(
        this.longestTiltedStreak,
        this.currentTiltedStreak,
      );
    } else {
      this.currentTiltedStreak = 0;
    }

    if (lowEnergy) {
      this.lowEnergyFrames += 1;
      this.currentLowEnergyStreak += 1;
      this.longestLowEnergyStreak = Math.max(
        this.longestLowEnergyStreak,
        this.currentLowEnergyStreak,
      );
    } else {
      this.currentLowEnergyStreak = 0;
    }

    this.lastGuidance = guidanceText(
      this.eyeEma,
      this.expressionEma,
      eye.label,
      expr.label,
      this.postureEma,
      eye.headTiltDegrees,
    );
  }

  reset(): void {
    this.frameCount = 0;
    this.detectedFaceFrames = 0;
    this.eyeEma = EMA_SEED;
    this.expressionEma = EMA_SEED;
    this.postureEma = EMA_SEED;
    this.overallEma = EMA_SEED;
    this.bestEye = 0;
    this.bestExpression = 0;
    this.bestPosture = 0;
    this.lastGuidance = 'Move into frame so your face is visible.';
    this.eyeSamples = [];
    this.expressionSamples = [];
    this.postureSamples = [];
    this.rawEyeSamples = [];
    this.rawExpressionSamples = [];
    this.rawPostureSamples = [];
    this.headTiltSamples = [];
    this.lookedAwayFrames = 0;
    this.postureDriftFrames = 0;
    this.tiltedFrames = 0;
    this.lowEnergyFrames = 0;
    this.currentLookedAwayStreak = 0;
    this.currentPostureDriftStreak = 0;
    this.currentTiltedStreak = 0;
    this.currentLowEnergyStreak = 0;
    this.longestLookedAwayStreak = 0;
    this.longestPostureDriftStreak = 0;
    this.longestTiltedStreak = 0;
    this.longestLowEnergyStreak = 0;
  }

  /** Returns null if no frames have been processed — the caller should
   *  omit the `cv_summary` multipart field in that case rather than
   *  sending an empty summary that the evaluator can't use. */
  buildSummary(): InterviewSummary | null {
    if (this.frameCount === 0) return null;

    const facePresence = (this.detectedFaceFrames / this.frameCount) * 100;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const lookedAwayPct = percentage(this.lookedAwayFrames, this.detectedFaceFrames);
    const postureDriftPct = percentage(this.postureDriftFrames, this.detectedFaceFrames);
    const tiltedPct = percentage(this.tiltedFrames, this.detectedFaceFrames);
    const lowEnergyPct = percentage(this.lowEnergyFrames, this.detectedFaceFrames);
    const headTiltAvg =
      this.headTiltSamples.length > 0
        ? this.headTiltSamples.reduce((sum, value) => sum + value, 0) /
          this.headTiltSamples.length
        : 0;
    const headTiltMax =
      this.headTiltSamples.length > 0 ? Math.max(...this.headTiltSamples) : 0;
    const robustEye = robustMean(this.rawEyeSamples, this.eyeEma);
    const robustExpression = robustMean(
      this.rawExpressionSamples,
      this.expressionEma,
    );
    const robustPosture = robustMean(this.rawPostureSamples, this.postureEma);

    return {
      quality_aggregation_version: 2,
      face_quality_sample_count: this.rawEyeSamples.length,
      eye_contact_score_robust: round1(robustEye),
      expression_score_robust: round1(robustExpression),
      posture_score_robust: round1(robustPosture),
      calibration_applied: this.calibration !== null,
      calibration_version: this.calibration?.version ?? null,
      calibrated_at: this.calibration?.calibratedAt ?? null,
      frames_processed: this.frameCount,
      face_visible_pct: round1(facePresence),
      eye_contact_score: round1(this.eyeEma),
      expression_score: round1(this.expressionEma),
      posture_score: round1(this.postureEma),
      overall_interview_score: round1(this.overallEma),
      eye_contact_stability: round1(scoreStability(this.eyeSamples)),
      expression_stability: round1(scoreStability(this.expressionSamples)),
      posture_stability: round1(scoreStability(this.postureSamples)),
      looked_away_pct: round1(lookedAwayPct),
      posture_drift_pct: round1(postureDriftPct),
      bad_posture_pct: round1(postureDriftPct),
      tilted_pct: round1(tiltedPct),
      low_energy_pct: round1(lowEnergyPct),
      longest_looked_away_streak_frames: this.longestLookedAwayStreak,
      longest_posture_drift_streak_frames: this.longestPostureDriftStreak,
      longest_bad_posture_streak_frames: this.longestPostureDriftStreak,
      longest_tilted_streak_frames: this.longestTiltedStreak,
      longest_low_energy_streak_frames: this.longestLowEnergyStreak,
      eye_contact_rating: scoreBand(this.eyeEma),
      expression_rating: scoreBand(this.expressionEma),
      posture_rating: scoreBand(this.postureEma),
      interview_rating: scoreBand(this.overallEma),
      best_eye_contact_frame_score: round1(this.bestEye),
      best_expression_frame_score: round1(this.bestExpression),
      best_posture_frame_score: round1(this.bestPosture),
      head_tilt_degrees_avg: round1(headTiltAvg),
      head_tilt_degrees_max: round1(headTiltMax),
      coaching_tip: summaryGuidance(
        facePresence,
        lookedAwayPct,
        postureDriftPct,
        tiltedPct,
        lowEnergyPct,
        this.lastGuidance,
      ),
      notes: [
        'Eye contact uses MediaPipe face and iris landmarks as a webcam-based gaze proxy.',
        'Expression scoring uses mouth width, eye openness, and brow relaxation as engagement cues.',
        'Posture scoring uses head tilt, face centering, and vertical head position as webcam posture cues.',
        'Delivery quality uses trimmed face-visible full-turn means; detector dropouts are handled by face visibility.',
        ...(this.calibration
          ? ['Browser-local face calibration adjusted bounded delivery baselines for this turn.']
          : []),
        'This is still a heuristic practice tool, not a validated interview or hiring assessment.',
      ],
    };
  }
}
