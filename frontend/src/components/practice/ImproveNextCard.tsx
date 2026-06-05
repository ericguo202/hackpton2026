/**
 * Practice-only "Improve next" inner card. Lives on row 3, right column of
 * the Turn tab in the Results phase.
 *
 * A thin renderer over the evaluator's answer-grounded feedback — no local
 * coaching generation. It surfaces:
 *   1. "What to fix first" — the forward `next_take` (focus + approach)
 *      produced by the separate coaching call (`backend/app/services/coaching.py`).
 *   2. "Keep this part" — a condensed forward reminder from the top positive
 *      moment (omitted for non-answers, which have no positive moments).
 *   3. "Filler words" — the per-word distribution chart, accurate even before
 *      scoring finishes.
 * Each block is omitted when its data is absent, so a coaching failure or a
 * non-answer just shows fewer blocks. The earlier `PLAYBOOKS` template machinery
 * (question-kind regex + fill-in-the-blank scaffolds) was retired in favor of
 * this; coaching now comes from the LLM that saw the answer.
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

import type { PositiveMoment, TurnDetail } from '../../types/history';
import { EvalStatusNotice, Eyebrow, InnerCard } from '../session-detail/_turnInnerCards';

type CoachingBlock = {
  title: string;
  detail: string;
  // Optional highlighted box rendered below `detail` (the next-take approach,
  // or the filler-words follow-up tip).
  action?: string;
  // Optional supplementary node (the filler distribution chart).
  extra?: ReactNode;
};

type Props = {
  turn: TurnDetail;
  // While scoring is still running (pending) or after a completed session whose
  // evaluation never returned (failed), the answer-grounded blocks aren't ready —
  // show a status notice instead. The filler block stays (submit-time data).
  evaluationPending: boolean;
  evaluationFailed: boolean;
};

export function ImproveNextCard({
  turn,
  evaluationPending,
  evaluationFailed,
}: Props) {
  const gated = evaluationPending || evaluationFailed;
  const blocks = gated
    ? (() => {
        const fillerBlock = buildFillerBlock(turn);
        return fillerBlock ? [fillerBlock] : [];
      })()
    : buildCoachingBlocks(turn);

  return (
    <InnerCard>
      <Eyebrow>Improve next</Eyebrow>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        {gated && (
          <EvalStatusNotice
            pending={evaluationPending}
            className="mb-4"
            pendingHint="Your focus areas will appear here once scoring finishes."
            failedHint="Focus areas could not be generated because the evaluator did not return scores."
          />
        )}
        {blocks.length === 0 ? (
          gated ? null : (
            <p className="text-sm text-text-subtle">
              Nothing to prioritize from this turn.
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-5">
            {blocks.map((block) => (
              <li key={block.title} className="border-l-2 border-accent/45 pl-4">
                <p className="mb-1 text-sm font-medium text-text">{block.title}</p>
                <p className="text-sm leading-6 text-text-muted">{block.detail}</p>
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

function buildCoachingBlocks(turn: TurnDetail): CoachingBlock[] {
  const blocks: CoachingBlock[] = [];

  const nextTake = buildNextTakeBlock(turn);
  if (nextTake) blocks.push(nextTake);

  // Grounded in the evaluator's real positive moments, so a non-answer
  // (positive_moments: []) gets no invented praise — the block is omitted.
  const keepThis = buildKeepThisBlock(turn);
  if (keepThis) blocks.push(keepThis);

  const fillerBlock = buildFillerBlock(turn);
  if (fillerBlock) blocks.push(fillerBlock);

  return blocks;
}

function buildNextTakeBlock(turn: TurnDetail): CoachingBlock | null {
  const nextTake = turn.feedback_detail?.next_take;
  const focus = nextTake?.focus?.trim();
  if (!focus) return null;
  const approach = nextTake?.approach?.trim();
  return {
    title: 'What to fix first',
    detail: focus,
    action: approach || undefined,
  };
}

function buildKeepThisBlock(turn: TurnDetail): CoachingBlock | null {
  const top = positiveMoments(turn)[0];
  if (!top) return null;

  const reinforcement = top.keep_doing?.trim() || top.why_this_helped?.trim();
  if (!reinforcement) return null;

  const snippet = top.transcript_snippet?.trim();
  return {
    title: 'Keep this part',
    detail: snippet
      ? `Carry forward what worked when you said "${snippet}" — ${reinforcement}`
      : `Carry this forward into the next take: ${reinforcement}`,
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

type FillerEntry = { word: string; count: number };

function sortedBreakdown(breakdown: Record<string, number>): FillerEntry[] {
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 6);
}

function positiveMoments(turn: TurnDetail): PositiveMoment[] {
  return turn.feedback_detail?.positive_moments ?? [];
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
