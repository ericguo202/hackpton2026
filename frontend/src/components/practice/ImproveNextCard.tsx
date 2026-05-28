/**
 * Practice-only "Improve next" inner card. Lives on row 3, right column of
 * the Turn tab in the Results phase.
 *
 * Summarizes 2-4 bite-sized "where to focus" notes derived from a turn's
 * scores + filler counts + webcam analytics. Mirrors the legacy
 * `buildReplayInsights` derivations from `Practice.tsx`, minus the
 * "Main takeaway" item — that already lives in the Takeaway card on row 2
 * of `PracticeTurnPanel` and would be redundant here.
 */

import type { Scores } from '../../types/session';
import type { InterviewSummary } from '../../lib/faceHeuristics';
import type { AnalyzerDiagnostics } from '../../hooks/useFaceAnalyzer';
import { Eyebrow, InnerCard } from '../session-detail/_turnInnerCards';

type Insight = {
  title: string;
  detail: string;
};

const SCORE_LABELS: Record<keyof Scores, string> = {
  structure: 'Structure',
  problem_solving: 'Problem Solving',
  impact: 'Impact',
  initiative: 'Initiative',
  depth: 'Depth',
  delivery: 'Delivery',
};

type Props = {
  scores: Scores | null;
  fillerWordCount: number;
  cvSummary: InterviewSummary | null;
  analyzerDiagnostics: AnalyzerDiagnostics;
};

export function ImproveNextCard({
  scores,
  fillerWordCount,
  cvSummary,
  analyzerDiagnostics,
}: Props) {
  const insights = buildInsights({ scores, fillerWordCount, cvSummary, analyzerDiagnostics });

  return (
    <InnerCard>
      <Eyebrow>Improve next</Eyebrow>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        {insights.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Nothing to prioritize from this turn.
          </p>
        ) : (
          <ul className="flex flex-col gap-5">
            {insights.map((insight) => (
              <li key={insight.title} className="border-l-2 border-accent/45 pl-4">
                <p className="mb-1 text-sm font-medium text-text">{insight.title}</p>
                <p className="text-sm leading-6 text-text-muted">{insight.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </InnerCard>
  );
}

function buildInsights({
  scores,
  fillerWordCount,
  cvSummary,
  analyzerDiagnostics,
}: Props): Insight[] {
  const insights: Insight[] = [];

  if (scores == null) {
    insights.push({
      title: 'Scores unavailable',
      detail:
        'The evaluator did not complete in time for this turn. Re-run the session to score this answer.',
    });
    return insights;
  }

  const entries = (Object.entries(scores) as Array<[keyof Scores, number | null]>)
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({
      key,
      label: SCORE_LABELS[key],
      value: value as number,
    }));

  const weakest = [...entries].sort((a, b) => a.value - b.value)[0];
  const strongest = [...entries].sort((a, b) => b.value - a.value)[0];

  if (weakest) {
    insights.push({
      title: `Most room to improve: ${weakest.label}`,
      detail: `${weakest.value}/10. Tighten this dimension first on your next take.`,
    });
  }

  if (strongest) {
    insights.push({
      title: `Keep this strength: ${strongest.label}`,
      detail: `${strongest.value}/10. This is the part of your answer style worth preserving.`,
    });
  }

  if (fillerWordCount > 0) {
    insights.push({
      title: 'Trim filler words',
      detail: `${fillerWordCount} filler words showed up in this turn. Check the highlighted spans in your transcript.`,
    });
  }

  if (cvSummary) {
    if (cvSummary.face_visible_pct < 85) {
      insights.push({
        title: 'Stay inside the frame',
        detail: `Face visibility was ${cvSummary.face_visible_pct}%. Keep your head centered so delivery scoring has a stable read.`,
      });
    }
    if (cvSummary.eye_contact_score < 55) {
      insights.push({
        title: 'Hold eye contact longer',
        detail: `Eye contact landed at ${cvSummary.eye_contact_score}/100. Pick one spot near the camera and return to it between phrases.`,
      });
    }
    if (cvSummary.expression_score < 50) {
      insights.push({
        title: 'Add more facial energy',
        detail: `Expression scored ${cvSummary.expression_score}/100. A small smile and slightly more open eyes will read as more engaged.`,
      });
    }
  } else {
    insights.push({
      title: 'Delivery score unavailable',
      detail:
        analyzerDiagnostics.framesProcessed > 0
          ? 'The browser captured camera frames, but no usable summary was produced before submit.'
          : 'No analyzer frames were processed for this turn, so delivery could not be scored.',
    });
  }

  return insights.slice(0, 4);
}
