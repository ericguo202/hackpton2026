import type { InterviewSummary } from './faceHeuristics';

const CALIBRATED_EYE_BAD = 47.4;
const CALIBRATED_EYE_GOOD = 71.0;
const CALIBRATED_EXPRESSION_BAD = 54.7;
const CALIBRATED_EXPRESSION_GOOD = 66.4;
const CALIBRATED_POSTURE_BAD = 58.0;
const CALIBRATED_POSTURE_GOOD = 82.0;

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

function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Frontend mirror of `backend/app/services/evaluator.py:_compute_delivery_score`.
 * Keep this in sync with backend changes so the playground explains the score
 * users later see on a submitted interview turn.
 */
export function computeDeliveryScoreDetail(
  summary: InterviewSummary | null,
): DeliveryScoreDetail | null {
  if (!summary) return null;

  const eye = summary.eye_contact_score;
  const expression = summary.expression_score;
  const posture = summary.posture_score;
  const faceVisible = summary.face_visible_pct;
  const eyeStability = summary.eye_contact_stability;
  const postureStability = summary.posture_stability;
  const lookedAwayPct = summary.looked_away_pct;
  const badPosturePct = summary.bad_posture_pct;
  const tiltedPct = summary.tilted_pct;
  const lookedAwayStreak = summary.longest_looked_away_streak_frames;
  const postureStreak = summary.longest_bad_posture_streak_frames;
  const tiltedStreak = summary.longest_tilted_streak_frames;
  const frames = summary.frames_processed;

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
  const visualStability = clamp(
    faceVisible * 0.4 + eyeStability * 0.35 + postureStability * 0.25,
  );

  const calibratedQuality =
    eyeQuality * 0.38 +
    expressionQuality * 0.2 +
    postureQuality * 0.22 +
    visualStability * 0.2;
  const rawQuality = eye * 0.5 + posture * 0.3 + visualStability * 0.2;

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
      points: badPosturePct * 0.12,
    },
    {
      label: 'Head-tilt coverage',
      value: tiltedPct,
      points: tiltedPct * 0.07,
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
        points: Math.min(10, postureStreakPct * 0.12),
      },
      {
        label: 'Longest head-tilt streak',
        value: tiltedStreakPct,
        points: Math.min(8, tiltedStreakPct * 0.1),
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
  if (postureIssuePct >= 70) capScore(3, 'Posture or head-tilt issue in 70%+ of frames');
  else if (postureIssuePct >= 50) capScore(4, 'Posture or head-tilt issue in 50%+ of frames');

  return {
    score,
    scoreBeforeCaps,
    baseScore,
    calibratedQuality,
    rawQuality,
    visualStability,
    components: [
      { label: 'Eye quality', value: eyeQuality, weight: 38 },
      { label: 'Expression quality', value: expressionQuality, weight: 20 },
      { label: 'Posture quality', value: postureQuality, weight: 22 },
      { label: 'Visual stability', value: visualStability, weight: 20 },
    ],
    penalties,
    caps,
  };
}
