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
 * Tunable defaults are frozen constants (see `_reset_selected_tunable`
 * in opencv.py L442); there is no runtime tuning in the browser.
 */

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
// When no face is detected, Python smooths toward 15.0 instead of 0 so
// a brief drop-out doesn't crater the rolling average (opencv.py L508-510).
const NO_FACE_TARGET = 15.0;

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

// ── scoring ───────────────────────────────────────────────────────────────────
export interface EyeContactResult {
  score: number;
  label: 'direct eye contact' | 'mostly engaged' | 'drifting gaze' | 'avoidant gaze';
  headAlignmentScore: number;
  verticalPosture: number;
  midpointOffset: number;
}

/**
 * Ported from `InterviewAnalyzer._score_eye_contact` (opencv.py L590).
 * The returned auxiliary metrics are what `current_issues` reads from
 * `last_metrics` on the Python side — we expose them directly instead.
 */
export function scoreEyeContact(points: Point[]): EyeContactResult {
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

  const leftCenterScore = 100 - Math.abs(leftGazeRatio - EYE_CENTER_TARGET) * EYE_CENTER_SENSITIVITY;
  const rightCenterScore = 100 - Math.abs(rightGazeRatio - EYE_CENTER_TARGET) * EYE_CENTER_SENSITIVITY;

  const eyeMidX = (leftIris[0] + rightIris[0]) / 2;
  const faceMidX = (faceLeft[0] + faceRight[0]) / 2;
  const headYawOffset = Math.abs(noseTip[0] - faceMidX) / Math.max(faceWidth * 0.5, 1);
  const midpointOffset = Math.abs(eyeMidX - faceMidX) / Math.max(faceWidth * 0.5, 1);
  const verticalPosture =
    Math.abs(noseTip[1] - (forehead[1] + chin[1]) / 2) / Math.max(faceHeight * 0.5, 1);
  const eyeSizeBalance =
    100 -
    (Math.abs(leftEyeWidth - rightEyeWidth) / Math.max(Math.max(leftEyeWidth, rightEyeWidth), 1)) *
      100;

  const headAlignmentScore = 100 - headYawOffset * HEAD_ALIGNMENT_SENSITIVITY;
  const midpointScore = 100 - midpointOffset * MIDPOINT_SENSITIVITY;
  const postureScore = 100 - verticalPosture * POSTURE_SENSITIVITY;

  const score = clamp(
    clamp(leftCenterScore) * EYE_LEFT_CENTER_WEIGHT +
      clamp(rightCenterScore) * EYE_RIGHT_CENTER_WEIGHT +
      clamp(headAlignmentScore) * EYE_HEAD_ALIGNMENT_WEIGHT +
      clamp(midpointScore) * EYE_MIDPOINT_WEIGHT +
      clamp(postureScore) * EYE_POSTURE_WEIGHT +
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
  };
}

export interface ExpressionResult {
  score: number;
  label: 'engaged expression' | 'professional expression' | 'flat expression' | 'low energy';
  smileScore: number;
  mouthOpenRatio: number;
}

/**
 * Ported from `InterviewAnalyzer._score_expression` (opencv.py L670).
 * Auxiliary metrics surfaced for the issue tally (same as Python's
 * `last_metrics` dict).
 */
export function scoreExpression(points: Point[]): ExpressionResult {
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

  const smileScore = clamp((smileRatio - SMILE_BASELINE) * SMILE_GAIN);
  const opennessScore = clamp((eyeOpenRatio - OPENNESS_BASELINE) * OPENNESS_GAIN);
  const relaxedBrowScore = clamp((browRelaxRatio - BROW_BASELINE) * BROW_GAIN);
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
): string {
  if (eyeScore < 45) return 'Look a bit closer to the camera and keep your head centered.';
  if (expressionScore < 45) return 'Add a slight smile and keep your eyes more open to look engaged.';
  if (eyeLabel.includes('drifting')) return 'Your gaze is close. Try holding it on the lens a little longer.';
  if (expressionLabel.includes('flat') || expressionLabel.includes('low energy')) {
    return 'Relax your face and add a little warmth between answers.';
  }
  return 'Nice balance. Maintain this level of eye contact and expression.';
}

// ── summary accumulator ───────────────────────────────────────────────────────

/** Shape matches `backend/interview_feedback_latest.json`. Keep the keys
 *  stable — `backend/app/services/evaluator._format_cv_block` reads them
 *  by name. */
export interface InterviewSummary {
  frames_processed: number;
  face_visible_pct: number;
  eye_contact_score: number;
  expression_score: number;
  overall_interview_score: number;
  eye_contact_rating: string;
  expression_rating: string;
  interview_rating: string;
  best_eye_contact_frame_score: number;
  best_expression_frame_score: number;
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
  private overallEma = EMA_SEED;
  private bestEye = 0;
  private bestExpression = 0;
  private lastGuidance = 'Move into frame so your face is visible.';

  private smooth(current: number, next: number): number {
    return clamp((1 - EMA_ALPHA) * current + EMA_ALPHA * next);
  }

  /** Feed the 468+iris landmarks for one frame, in pixel coordinates.
   *  Pass `null` when the detector returned no face; the EMA relaxes
   *  toward 15 so a short drop-out doesn't tank the average. */
  update(points: Point[] | null): void {
    this.frameCount += 1;

    if (!points) {
      this.eyeEma = this.smooth(this.eyeEma, NO_FACE_TARGET);
      this.expressionEma = this.smooth(this.expressionEma, NO_FACE_TARGET);
      this.overallEma = this.smooth(this.overallEma, NO_FACE_TARGET);
      this.lastGuidance = 'Center your face in the camera to begin interview scoring.';
      return;
    }

    this.detectedFaceFrames += 1;
    const eye = scoreEyeContact(points);
    const expr = scoreExpression(points);
    const overall = clamp(eye.score * 0.65 + expr.score * 0.35);

    this.eyeEma = this.smooth(this.eyeEma, eye.score);
    this.expressionEma = this.smooth(this.expressionEma, expr.score);
    this.overallEma = this.smooth(this.overallEma, overall);
    this.bestEye = Math.max(this.bestEye, eye.score);
    this.bestExpression = Math.max(this.bestExpression, expr.score);

    this.lastGuidance = guidanceText(
      this.eyeEma,
      this.expressionEma,
      eye.label,
      expr.label,
    );
  }

  reset(): void {
    this.frameCount = 0;
    this.detectedFaceFrames = 0;
    this.eyeEma = EMA_SEED;
    this.expressionEma = EMA_SEED;
    this.overallEma = EMA_SEED;
    this.bestEye = 0;
    this.bestExpression = 0;
    this.lastGuidance = 'Move into frame so your face is visible.';
  }

  /** Returns null if no frames have been processed — the caller should
   *  omit the `cv_summary` multipart field in that case rather than
   *  sending an empty summary that the evaluator can't use. */
  buildSummary(): InterviewSummary | null {
    if (this.frameCount === 0) return null;

    const facePresence = (this.detectedFaceFrames / this.frameCount) * 100;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
      frames_processed: this.frameCount,
      face_visible_pct: round1(facePresence),
      eye_contact_score: round1(this.eyeEma),
      expression_score: round1(this.expressionEma),
      overall_interview_score: round1(this.overallEma),
      eye_contact_rating: scoreBand(this.eyeEma),
      expression_rating: scoreBand(this.expressionEma),
      interview_rating: scoreBand(this.overallEma),
      best_eye_contact_frame_score: round1(this.bestEye),
      best_expression_frame_score: round1(this.bestExpression),
      coaching_tip: this.lastGuidance,
      notes: [
        'Eye contact uses MediaPipe face and iris landmarks as a webcam-based gaze proxy.',
        'Expression scoring uses mouth width, eye openness, and brow relaxation as engagement cues.',
        'This is still a heuristic practice tool, not a validated interview or hiring assessment.',
      ],
    };
  }
}
