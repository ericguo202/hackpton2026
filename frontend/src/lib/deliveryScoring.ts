import type { InterviewSummary } from './faceHeuristics';

// SYNC: these bands and every constant below are copied verbatim from
// `backend/app/services/evaluator.py` (the CALIBRATED_* block +
// `_compute_delivery_score`). The backend is the source of truth — see the
// ledger on `computeDeliveryScoreDetail` for the full list of what must move
// together when either side changes.
const CALIBRATED_EYE_BAD = 47.4;
const CALIBRATED_EYE_GOOD = 71.0;
const CALIBRATED_EXPRESSION_BAD = 54.7;
const CALIBRATED_EXPRESSION_GOOD = 66.4;
const CALIBRATED_POSTURE_BAD = 58.0;
const CALIBRATED_POSTURE_GOOD = 82.0;
const ROBUST_QUALITY_FULL_CONFIDENCE_SAMPLES = 20;

export type DeliveryScoreComponent = {
  label: string;
  value: number;
  weight: number;
};

export type DeliveryScorePenalty = {
  label: string;
  value: number;
  points: number;
};

export type DeliveryScoreDetail = {
  score: number;
  scoreBeforeCaps: number;
  baseScore: number;
  calibratedQuality: number;
  rawQuality: number;
  visualStability: number;
  components: DeliveryScoreComponent[];
  penalties: DeliveryScorePenalty[];
  caps: string[];
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeBand(value: number, bad: number, good: number): number {
  if (good <= bad) return clamp(value);
  return clamp(((value - bad) / (good - bad)) * 100);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function percentage(value: number | undefined, fallback: number): number {
  return clamp(finiteOr(value, fallback));
}

function qualityScore(
  summary: InterviewSummary,
  robust: number | undefined,
  legacy: number | undefined,
  fallback: number,
): number {
  const legacyScore = percentage(legacy, fallback);
  if (
    finiteOr(summary.quality_aggregation_version, 0) < 2 ||
    robust === undefined ||
    !Number.isFinite(robust)
  ) {
    return legacyScore;
  }

  const robustScore = percentage(robust, legacyScore);
  const sampleCount = Math.max(
    0,
    finiteOr(summary.face_quality_sample_count, 0),
  );
  const confidence = Math.min(
    1,
    sampleCount / ROBUST_QUALITY_FULL_CONFIDENCE_SAMPLES,
  );
  return legacyScore + (robustScore - legacyScore) * confidence;
}

function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Frontend mirror of `backend/app/services/evaluator.py:_compute_delivery_score`,
 * so the Delivery playground shows the same number a real turn will score. The
 * backend is the source of truth; this must be a line-for-line port of it.
 *
 * SYNC — when the backend function changes, port the identical change here in the
 * same commit (no test enforces it yet). Watch these parallel points:
 *   - the CALIBRATED_* bands + `normalizeBand` mapping;
 *   - robust quality selection (aggregation version 2, 20-sample confidence)
 *     and finite 0..100 input bounds;
 *   - desktop component weights (calibrated 0.38/0.20/0.22/0.20, raw
 *     0.50/0.30/0.20, visual stability 0.40/0.35/0.25), mobile weights
 *     (0.43/0.22/0.15/0.20, 0.58/0.22/0.20, 0.65/0.25/0.10), and the shared
 *     0.65/0.35 base blend;
 *   - desktop/mobile coverage penalties (0.18/0.12/0.07 vs.
 *     0.18/0.06/0.035), streak penalties + min() caps, and the
 *     face-visibility penalty (<96, ×0.55, cap 12);
 *   - `roundHalfEven(baseScore / 10)` mirrors Python's banker's-rounding
 *     `round()` — do NOT swap in Math.round;
 *   - the hard caps (looked-away 85/70/55/40, low-eye+looked-away, face-visible
 *     50/70/85, desktop posture/tilt 70/50, mobile alignment 85/70);
 *   - which InterviewSummary fields are read vs. the backend's cv_summary keys.
 */
export function computeDeliveryScoreDetail(
  summary: InterviewSummary | null,
): DeliveryScoreDetail | null {
  if (!summary) return null;

  const overall = percentage(summary.overall_interview_score, 0);
  const eye = qualityScore(
    summary,
    summary.eye_contact_score_robust,
    summary.eye_contact_score,
    overall,
  );
  const expression = qualityScore(
    summary,
    summary.expression_score_robust,
    summary.expression_score,
    overall,
  );
  const posture = qualityScore(
    summary,
    summary.posture_score_robust,
    summary.posture_score,
    overall,
  );
  const faceVisible = percentage(summary.face_visible_pct, 100);
  const eyeStability = percentage(summary.eye_contact_stability, 100);
  const postureStability = percentage(summary.posture_stability, 100);
  const lookedAwayPct = percentage(summary.looked_away_pct, 0);
  const postureDriftPct = percentage(summary.posture_drift_pct, 0);
  const badPosturePct = percentage(
    summary.bad_posture_pct,
    postureDriftPct,
  );
  const tiltedPct = percentage(summary.tilted_pct, 0);
  const frames = Math.max(0, finiteOr(summary.frames_processed, 0));
  const lookedAwayStreak = Math.max(
    0,
    Math.min(
      frames,
      finiteOr(summary.longest_looked_away_streak_frames, 0),
    ),
  );
  const postureStreak = Math.max(
    0,
    Math.min(
      frames,
      finiteOr(
        summary.longest_bad_posture_streak_frames,
        finiteOr(summary.longest_posture_drift_streak_frames, 0),
      ),
    ),
  );
  const tiltedStreak = Math.max(
    0,
    Math.min(
      frames,
      finiteOr(summary.longest_tilted_streak_frames, 0),
    ),
  );
  const mobileCapture =
    summary.capture_mode === 'mobile_portrait' ||
    summary.capture_mode === 'mobile_landscape';

  const eyeQuality = normalizeBand(
    eye,
    CALIBRATED_EYE_BAD,
    CALIBRATED_EYE_GOOD,
  );
  const expressionQuality = normalizeBand(
    expression,
    CALIBRATED_EXPRESSION_BAD,
    CALIBRATED_EXPRESSION_GOOD,
  );
  const postureQuality = normalizeBand(
    posture,
    CALIBRATED_POSTURE_BAD,
    CALIBRATED_POSTURE_GOOD,
  );
  const visualStability = mobileCapture
    ? clamp(faceVisible * 0.65 + eyeStability * 0.25 + postureStability * 0.1)
    : clamp(faceVisible * 0.4 + eyeStability * 0.35 + postureStability * 0.25);

  const calibratedQuality = mobileCapture
    ? eyeQuality * 0.43 +
      expressionQuality * 0.22 +
      postureQuality * 0.15 +
      visualStability * 0.2
    : eyeQuality * 0.38 +
      expressionQuality * 0.2 +
      postureQuality * 0.22 +
      visualStability * 0.2;
  const rawQuality = mobileCapture
    ? eye * 0.58 + posture * 0.22 + visualStability * 0.2
    : eye * 0.5 + posture * 0.3 + visualStability * 0.2;

  let baseScore = calibratedQuality * 0.65 + rawQuality * 0.35;
  const penalties: DeliveryScorePenalty[] = [
    {
      label: 'Looked-away coverage',
      value: lookedAwayPct,
      points: lookedAwayPct * 0.18,
    },
    {
      label: 'Posture drift coverage',
      value: badPosturePct,
      points: badPosturePct * (mobileCapture ? 0.06 : 0.12),
    },
    {
      label: 'Head-tilt coverage',
      value: tiltedPct,
      points: tiltedPct * (mobileCapture ? 0.035 : 0.07),
    },
  ];

  if (frames > 0) {
    const lookedAwayStreakPct = (lookedAwayStreak / frames) * 100;
    const postureStreakPct = (postureStreak / frames) * 100;
    const tiltedStreakPct = (tiltedStreak / frames) * 100;
    penalties.push(
      {
        label: 'Longest looked-away streak',
        value: lookedAwayStreakPct,
        points: Math.min(14, lookedAwayStreakPct * 0.18),
      },
      {
        label: 'Longest posture-drift streak',
        value: postureStreakPct,
        points: Math.min(
          mobileCapture ? 6 : 10,
          postureStreakPct * (mobileCapture ? 0.06 : 0.12),
        ),
      },
      {
        label: 'Longest head-tilt streak',
        value: tiltedStreakPct,
        points: Math.min(
          mobileCapture ? 5 : 8,
          tiltedStreakPct * (mobileCapture ? 0.05 : 0.1),
        ),
      },
    );
  }

  if (faceVisible < 96) {
    penalties.push({
      label: 'Low face visibility',
      value: 96 - faceVisible,
      points: Math.min(12, (96 - faceVisible) * 0.55),
    });
  }

  for (const penalty of penalties) {
    baseScore -= penalty.points;
  }

  let score = clamp(roundHalfEven(baseScore / 10), 0, 10);
  const scoreBeforeCaps = score;
  const caps: string[] = [];

  function capScore(maximum: number, label: string) {
    if (score > maximum) {
      score = maximum;
      caps.push(label);
    }
  }

  if (lookedAwayPct >= 85) capScore(2, 'Looked away in 85%+ of face frames');
  else if (lookedAwayPct >= 70) capScore(3, 'Looked away in 70%+ of face frames');
  else if (lookedAwayPct >= 55) capScore(4, 'Looked away in 55%+ of face frames');
  else if (lookedAwayPct >= 40) capScore(5, 'Looked away in 40%+ of face frames');

  if (eye < CALIBRATED_EYE_BAD && lookedAwayPct >= 25) {
    capScore(4, 'Low eye-contact score plus sustained looked-away coverage');
  }

  if (faceVisible < 50) capScore(2, 'Face visible in less than 50% of frames');
  else if (faceVisible < 70) capScore(3, 'Face visible in less than 70% of frames');
  else if (faceVisible < 85) capScore(5, 'Face visible in less than 85% of frames');

  const postureIssuePct = Math.max(badPosturePct, tiltedPct);
  if (mobileCapture) {
    if (postureIssuePct >= 85) {
      capScore(4, 'Phone/camera alignment issue in 85%+ of frames');
    } else if (postureIssuePct >= 70) {
      capScore(5, 'Phone/camera alignment issue in 70%+ of frames');
    }
  } else if (postureIssuePct >= 70) {
    capScore(3, 'Posture or head-tilt issue in 70%+ of frames');
  } else if (postureIssuePct >= 50) {
    capScore(4, 'Posture or head-tilt issue in 50%+ of frames');
  }

  return {
    score,
    scoreBeforeCaps,
    baseScore,
    calibratedQuality,
    rawQuality,
    visualStability,
    components: [
      { label: 'Eye quality', value: eyeQuality, weight: mobileCapture ? 43 : 38 },
      { label: 'Expression quality', value: expressionQuality, weight: mobileCapture ? 22 : 20 },
      { label: 'Posture quality', value: postureQuality, weight: mobileCapture ? 15 : 22 },
      { label: 'Visual stability', value: visualStability, weight: 20 },
    ],
    penalties,
    caps,
  };
}
