/**
 * Practice-only "Improve next" inner card. Lives on row 3, right column of
 * the Turn tab in the Results phase.
 *
 * Converts scores and structured feedback into a small coaching playbook:
 * what to fix first, how to think through the answer, and a reusable
 * scaffold. Filler words keep the original chart as delivery polish.
 */

import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import type { ImprovementMoment, TurnDetail } from '../../types/history';
import type { InterviewSummary } from '../../lib/faceHeuristics';
import type { AnalyzerDiagnostics } from '../../hooks/useFaceAnalyzer';
import { Eyebrow, InnerCard } from '../session-detail/_turnInnerCards';

type CoachingBlock = {
  title: string;
  detail: string;
  action?: string;
  checklist?: string[];
  extra?: ReactNode;
};

type PriorityKind =
  | 'outcome'
  | 'reasoning'
  | 'detail'
  | 'ownership'
  | 'structure'
  | 'off_track'
  | 'delivery'
  | 'general';

type QuestionKind =
  | 'workload'
  | 'conflict'
  | 'leadership'
  | 'failure'
  | 'general';

type StoryPlaybook = {
  checklist: string[];
  scaffold: Partial<Record<PriorityKind, string>> & { default: string };
};

const SCORE_LABELS: Record<keyof TurnDetail['scores'], string> = {
  structure: 'Structure',
  problem_solving: 'Problem Solving',
  impact: 'Impact',
  initiative: 'Initiative',
  depth: 'Depth',
  delivery: 'Delivery',
};

const PLAYBOOKS: Record<QuestionKind, StoryPlaybook> = {
  workload: {
    checklist: [
      'What was the actual load: tests, assignments, deadlines, or stakes?',
      'What rule did you use to rank the work?',
      'What did you do first, next, and deliberately not overdo?',
      'What got finished, protected, improved, or avoided because of that system?',
    ],
    scaffold: {
      outcome:
        'I had ___ due by ___, so I ranked them by deadline, difficulty, and grade risk. I handled ___ first because ___. Using that order, I finished ___ by ___ and protected/improved ___.',
      reasoning:
        'I prioritized ___ over ___ because ___ had the bigger deadline/grade risk. That let me ___ without falling behind on ___.',
      detail:
        'I had ___ tests and ___ assignments due that week. The hardest constraint was ___, so I ___ first.',
      ownership:
        'My rule was ___. I decided to ___ first, then ___, because ___.',
      structure:
        'The load was ___. My priority rule was ___. I acted by ___. The result was ___.',
      default:
        'I had ___ due by ___. I ranked the work by ___. I did ___ first because ___. The result was ___.',
    },
  },
  conflict: {
    checklist: [
      'What was the disagreement or tension?',
      'What did the other person care about?',
      'What did you say or do to move it forward?',
      'How was the relationship, decision, or outcome better afterward?',
    ],
    scaffold: {
      outcome:
        'After that conversation, we agreed to ___, which improved ___ because ___.',
      reasoning:
        'I focused on ___ because their main concern was ___, while my concern was ___.',
      detail:
        'The disagreement was about ___. They were worried about ___, and I was trying to ___.',
      ownership:
        'My role was to ___. I brought ___ into the conversation and proposed ___.',
      structure:
        'The conflict was ___. Their concern was ___. I responded by ___. The result was ___.',
      default:
        'The disagreement was ___. I learned they cared about ___. I responded by ___. The result was ___.',
    },
  },
  leadership: {
    checklist: [
      'What need or gap did you notice?',
      'What did you personally take ownership of?',
      'Who did you influence, organize, or help?',
      'What changed because you stepped in?',
    ],
    scaffold: {
      outcome:
        'Because I took ownership of ___, the team was able to ___ by ___.',
      reasoning:
        'I chose to focus on ___ because it was blocking ___ more than ___.',
      detail:
        'The gap I noticed was ___. I organized ___ and used ___ to keep people moving.',
      ownership:
        'I personally owned ___. I coordinated ___, made ___ decision, and followed through by ___.',
      structure:
        'The need was ___. I took ownership of ___. I helped the team by ___. The result was ___.',
      default:
        'I noticed ___. I took ownership of ___. I helped ___ do ___. The result was ___.',
    },
  },
  failure: {
    checklist: [
      'What went wrong?',
      'What caused it, including your part?',
      'What did you change afterward?',
      'How did your behavior or result improve next time?',
    ],
    scaffold: {
      outcome:
        'After changing ___, the next time I ___ and the result was ___.',
      reasoning:
        'The root cause was ___, so I changed ___ instead of only ___.',
      detail:
        'The mistake was ___. The specific cause was ___, and I corrected it by ___.',
      ownership:
        'My part in the mistake was ___. I took responsibility by ___.',
      structure:
        'The mistake was ___. The cause was ___. I changed ___. The next result was ___.',
      default:
        'I made the mistake of ___. I realized the cause was ___. I changed ___. The next time, ___.',
    },
  },
  general: {
    checklist: [
      'What was the situation?',
      'What was your role or decision?',
      'What action did you take?',
      'What changed or what did you learn?',
    ],
    scaffold: {
      outcome:
        'The result was ___, which mattered because ___.',
      reasoning:
        'I chose that approach because ___ mattered more than ___.',
      detail:
        'The specific constraint was ___, so I ___.',
      ownership:
        'My specific role was ___. I personally handled ___.',
      structure:
        'The situation was ___. My role was ___. I acted by ___. The result was ___.',
      default:
        'The situation was ___. My role was ___. I did ___. The result was ___.',
    },
  },
};

type Props = {
  turn: TurnDetail;
  cvSummary: InterviewSummary | null;
  analyzerDiagnostics: AnalyzerDiagnostics;
};

export function ImproveNextCard({
  turn,
  cvSummary,
  analyzerDiagnostics,
}: Props) {
  const blocks = buildCoachingBlocks({ turn, cvSummary, analyzerDiagnostics });

  return (
    <InnerCard>
      <Eyebrow>Improve next</Eyebrow>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        {blocks.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Nothing to prioritize from this turn.
          </p>
        ) : (
          <ul className="flex flex-col gap-5">
            {blocks.map((block) => (
              <li key={block.title} className="border-l-2 border-accent/45 pl-4">
                <p className="mb-1 text-sm font-medium text-text">{block.title}</p>
                <p className="text-sm leading-6 text-text-muted">{block.detail}</p>
                {block.checklist && (
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                    {block.checklist.map((item) => (
                      <li key={item} className="text-sm leading-6 text-text-muted">
                        {item}
                      </li>
                    ))}
                  </ol>
                )}
                {block.action && (
                  <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm leading-6 text-text">
                    {block.action}
                  </p>
                )}
                {block.extra}
              </li>
            ))}
          </ul>
        )}
      </div>
    </InnerCard>
  );
}

function buildCoachingBlocks({
  turn,
  cvSummary,
  analyzerDiagnostics,
}: Props): CoachingBlock[] {
  const moments = improvementMoments(turn);
  const scoreEntries = scoreEntriesFor(turn);
  const priority = inferPriority({ turn, moments, cvSummary });
  const questionKind = questionKindFor(turn.question_text);
  const playbook = PLAYBOOKS[questionKind];
  const blocks: CoachingBlock[] = [
    buildPriorityBlock({ turn, priority, moments, questionKind }),
    buildStoryBlock({ questionKind, playbook }),
    buildTryThisBlock({ priority, playbook }),
  ];

  const fillerBlock = buildFillerBlock(turn);
  if (fillerBlock) blocks.push(fillerBlock);

  if (
    blocks.length === 3 &&
    !turn.feedback_detail?.main_takeaway &&
    scoreEntries.length === 0 &&
    analyzerDiagnostics.framesProcessed === 0
  ) {
    return [{
      title: 'Next focus',
      detail:
        'There was not enough scored feedback to isolate a specific issue. Build the next take around one clear example with your role and result.',
      action: PLAYBOOKS.general.scaffold.default,
    }];
  }

  return blocks;
}

function buildPriorityBlock({
  turn,
  priority,
  moments,
  questionKind,
}: {
  turn: TurnDetail;
  priority: PriorityKind;
  moments: ImprovementMoment[];
  questionKind: QuestionKind;
}): CoachingBlock {
  const matchingMoment = moments.find(
    (moment) => priorityFromIssue(moment.issue_type) === priority,
  );
  const snippet = matchingMoment?.transcript_snippet?.trim();
  const snippetText = snippet ? ` The phrase "${snippet}" is the spot to tighten first.` : '';

  switch (priority) {
    case 'outcome':
      return {
        title: 'What to fix first',
        detail:
          questionKind === 'workload'
            ? 'You explained your prioritization system, but the answer stops before the interviewer knows whether it worked. That is why impact feels low: there is no finished outcome, avoided problem, grade improvement, or concrete result.'
            : 'You explained the action, but the payoff is still unclear. The interviewer needs to hear what changed because of your work.' +
              snippetText,
      };
    case 'reasoning':
      return {
        title: 'What to fix first',
        detail:
          questionKind === 'workload'
            ? 'The answer needs sharper decision logic. Do not only list the order of tasks; explain why one deadline, class, or assignment deserved attention before another.'
            : 'The answer needs more decision logic. Show the trade-off, constraint, or reason that made your choice sensible.' +
              snippetText,
      };
    case 'detail':
      return {
        title: 'What to fix first',
        detail:
          questionKind === 'workload'
            ? 'The workload needs to feel concrete. Add numbers, deadlines, class difficulty, grade risk, or the exact pressure so your prioritization has stakes.'
            : 'The story needs one concrete detail. Name the constraint, person, metric, or exact problem so the answer feels real.' +
              snippetText,
      };
    case 'ownership':
      return {
        title: 'What to fix first',
        detail:
          'Make your ownership clearer. Separate what the situation required from what you personally decided, changed, organized, or followed through on.' +
          snippetText,
      };
    case 'structure':
      return {
        title: 'What to fix first',
        detail:
          'The material needs a cleaner story shape. The listener should be able to follow the setup, your rule or decision, your action, and the result without reconstructing it themselves.',
      };
    case 'off_track':
      return {
        title: 'What to fix first',
        detail:
          'Answer the prompt sooner. Start with the exact example, then add only the context that helps explain your decision or result.',
      };
    case 'delivery':
      return {
        title: 'What to fix first',
        detail:
          'Delivery was the biggest distraction. Steadier camera presence will help the same content sound more controlled.',
      };
    default:
      return {
        title: 'What to fix first',
        detail:
          turn.feedback_detail?.main_takeaway ??
          'Make the next take easier to follow by naming the situation, your role, your action, and the result.',
      };
  }
}

function buildStoryBlock({
  questionKind,
  playbook,
}: {
  questionKind: QuestionKind;
  playbook: StoryPlaybook;
}): CoachingBlock {
  return {
    title: 'How to build the better story',
    detail: storyIntroFor(questionKind),
    checklist: playbook.checklist,
  };
}

function buildTryThisBlock({
  priority,
  playbook,
}: {
  priority: PriorityKind;
  playbook: StoryPlaybook;
}): CoachingBlock {
  return {
    title: 'Try this next',
    detail:
      'Use this as a rough scaffold, not a script. Fill the blanks with your real details.',
    action: playbook.scaffold[priority] ?? playbook.scaffold.default,
  };
}

function buildFillerBlock(turn: TurnDetail): CoachingBlock | null {
  if (turn.filler_word_count <= 0) return null;

  const breakdownEntries = sortedBreakdown(turn.filler_word_breakdown);
  const topFiller = breakdownEntries[0];
  const rate = numericRate(turn.filler_word_rate);
  const rateText =
    rate == null
      ? `${turn.filler_word_count} filler word${turn.filler_word_count === 1 ? '' : 's'} showed up.`
      : `Your filler rate was ${rate.toFixed(1)}%, with ${turn.filler_word_count} filler word${turn.filler_word_count === 1 ? '' : 's'} total.`;
  const polishText = fillerRateGuidance(rate);

  return {
    title: 'Filler words',
    detail:
      `${rateText} ${
        topFiller ? `The main one was "${topFiller.word}" (${topFiller.count}x). ` : ''
      }${polishText}`,
    action:
      'After the story is stronger, use the transcript highlights to replace repeated fillers with a short pause.',
    extra:
      breakdownEntries.length > 0 ? (
        <FillerBreakdownChart entries={breakdownEntries} />
      ) : undefined,
  };
}

function inferPriority({
  turn,
  moments,
  cvSummary,
}: {
  turn: TurnDetail;
  moments: ImprovementMoment[];
  cvSummary: InterviewSummary | null;
}): PriorityKind {
  const severeContentScore = scoreEntriesFor(turn)
    .filter((entry) => entry.key !== 'delivery')
    .find((entry) => entry.value <= 3);
  if (severeContentScore) {
    const fromScore = priorityFromScore(severeContentScore.key);
    if (fromScore) return fromScore;
  }

  const firstIssue = moments[0]?.issue_type;
  const fromIssue = firstIssue ? priorityFromIssue(firstIssue) : null;
  if (fromIssue) return fromIssue;

  const weakestContentScore = scoreEntriesFor(turn)
    .filter((entry) => entry.key !== 'delivery')[0];
  if (weakestContentScore) {
    const fromScore = priorityFromScore(weakestContentScore.key);
    if (fromScore) return fromScore;
  }

  if (deliveryIssueFor(cvSummary)) return 'delivery';
  if (turn.feedback_detail?.main_takeaway) return 'general';
  return 'structure';
}

type FillerEntry = { word: string; count: number };
type ScoreEntry = {
  key: keyof TurnDetail['scores'];
  label: string;
  value: number;
};

function sortedBreakdown(breakdown: Record<string, number>): FillerEntry[] {
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 6);
}

function improvementMoments(turn: TurnDetail): ImprovementMoment[] {
  return (
    turn.feedback_detail?.improvement_moments ??
    turn.feedback_detail?.coaching_moments ??
    []
  );
}

function scoreEntriesFor(turn: TurnDetail): ScoreEntry[] {
  return (Object.entries(turn.scores) as Array<[keyof TurnDetail['scores'], number | null]>)
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({
      key,
      label: SCORE_LABELS[key],
      value: value as number,
    }))
    .sort((a, b) => a.value - b.value);
}

function priorityFromIssue(issue: string): PriorityKind | null {
  switch (issue) {
    case 'missing_result':
      return 'outcome';
    case 'missing_reasoning':
      return 'reasoning';
    case 'too_vague':
    case 'missing_detail':
    case 'missed_opportunity':
      return 'detail';
    case 'weak_wording':
      return 'ownership';
    case 'off_track':
    case 'does_not_answer_question':
    case 'unprofessional':
      return 'off_track';
    case 'delivery':
      return 'delivery';
    default:
      return null;
  }
}

function priorityFromScore(key: keyof TurnDetail['scores']): PriorityKind | null {
  switch (key) {
    case 'impact':
      return 'outcome';
    case 'problem_solving':
      return 'reasoning';
    case 'depth':
      return 'detail';
    case 'initiative':
      return 'ownership';
    case 'structure':
      return 'structure';
    case 'delivery':
      return 'delivery';
    default:
      return null;
  }
}

function questionKindFor(question: string): QuestionKind {
  if (/\b(workload|prioriti[sz]e|multiple projects|supervisors|tasks|assignments|deadlines?)\b/i.test(question)) {
    return 'workload';
  }
  if (/\b(conflict|disagree|difficult person|teammate|stakeholder|pushback|persuad|resolve)\b/i.test(question)) {
    return 'conflict';
  }
  if (/\b(lead|leadership|initiative|ownership|took charge|managed|organized)\b/i.test(question)) {
    return 'leadership';
  }
  if (/\b(fail|failure|mistake|setback|learned|wrong|improve)\b/i.test(question)) {
    return 'failure';
  }
  return 'general';
}

function storyIntroFor(questionKind: QuestionKind): string {
  switch (questionKind) {
    case 'workload':
      return 'For workload questions, the interviewer is testing whether your system actually helped you make trade-offs and finish the right work.';
    case 'conflict':
      return 'For conflict questions, the interviewer is testing whether you understood both sides and moved the situation forward professionally.';
    case 'leadership':
      return 'For leadership questions, the interviewer is testing whether you noticed a need, took ownership, and helped others get to a better result.';
    case 'failure':
      return 'For failure questions, the interviewer is testing whether you can own the mistake, find the cause, and change your behavior afterward.';
    default:
      return 'For behavioral questions, the interviewer needs a clear story they can follow and evidence that your actions changed something.';
  }
}

function numericRate(rate: string | null): number | null {
  if (!rate) return null;
  const value = Number.parseFloat(rate);
  return Number.isFinite(value) ? value : null;
}

function fillerRateGuidance(rate: number | null): string {
  if (rate == null) return 'Use this as delivery polish after the content fix.';
  if (rate <= 5) return 'That is low, so treat this as polish rather than the main content fix.';
  if (rate <= 10) return 'That is moderate. Tighten it after the content fix.';
  return 'That is high enough to distract, but still fix the story substance first.';
}

function FillerBreakdownChart({ entries }: { entries: FillerEntry[] }) {
  const rowHeight = 22;
  const height = entries.length * rowHeight + 8;
  return (
    <div className="mt-3" aria-label="Filler word distribution">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          layout="vertical"
          data={entries}
          margin={{ top: 2, right: 28, bottom: 2, left: 0 }}
          barCategoryGap={4}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="word"
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 3, 3, 0]} barSize={12}>
            <LabelList
              dataKey="count"
              position="right"
              fontSize={11}
              fill="var(--color-text-muted)"
              offset={6}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function deliveryIssueFor(cvSummary: InterviewSummary | null): CoachingBlock | null {
  if (!cvSummary) return null;
  if (cvSummary.face_visible_pct < 85) {
    return {
      title: 'Delivery',
      detail: `Face visibility was ${cvSummary.face_visible_pct}%, so the camera read was unstable.`,
      action: 'Center your face in the frame before you start the next answer.',
    };
  }
  if (cvSummary.eye_contact_score < 60 || cvSummary.looked_away_pct >= 20) {
    return {
      title: 'Delivery',
      detail:
        `Eye contact was ${cvSummary.eye_contact_score}/100, with ` +
        `${cvSummary.looked_away_pct}% looked-away frames.`,
      action: 'Return your eyes to the camera between phrases, especially before the result.',
    };
  }
  if (
    cvSummary.posture_score < 68 ||
    cvSummary.bad_posture_pct >= 12 ||
    cvSummary.tilted_pct >= 12
  ) {
    return {
      title: 'Delivery',
      detail:
        `Posture was ${cvSummary.posture_score}/100, with visible drift or tilt during the answer.`,
      action: 'Sit upright and keep your head level while giving the example.',
    };
  }
  if (cvSummary.expression_score < 50) {
    return {
      title: 'Delivery',
      detail: `Expression was ${cvSummary.expression_score}/100, so the answer may read flatter than intended.`,
      action: 'Add a little facial warmth when you state the action and result.',
    };
  }
  return null;
}
