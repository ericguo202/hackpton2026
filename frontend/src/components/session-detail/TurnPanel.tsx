/**
 * One turn rendered inside the SessionDetail folder card.
 *
 * Below 900px: single column, cards stack in the order:
 *   Q+A → Scores+Takeaway+QuickWins → What Worked → Improvement Moments.
 *
 * At ≥900px: 2×2 grid with `auto-rows-fr` so both cards in each row share
 * the same height. Inner cards live in `bg-surface-raised` (lighter beige)
 * against the outer dark-beige container so they read as paper inserts.
 *
 * Evaluation-failed turns (turn.scores.structure === null) collapse the
 * Scores band to a one-line "Evaluation failed" notice — the rest of the
 * card still renders the transcript, takeaway, and any moments that were
 * persisted.
 */

import { useId } from 'react';
import type { TurnDetail } from '../../types/history';
import { tokenizeTranscript } from '../../lib/fillerWords';
import { SCORE_COLOR_MAP, SCORE_KEYS } from './_helpers';

type Props = {
  turn: TurnDetail;
};

export default function TurnPanel({ turn }: Props) {
  const evaluationFailed = turn.scores.structure === null;

  // Two independent row grids — within each row the sibling cards match
  // height (grid items-stretch + InnerCard's h-full), but the bottom row
  // doesn't drag the top row up to its size. The old single grid with
  // `auto-rows-fr` forced both rows to match the taller of the two,
  // which left huge empty gutters under Q+A and Scores when the bottom
  // row had long feedback content.
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
        <QuestionAnswerCard turn={turn} />
        <ScoresTakeawayWinsCard turn={turn} evaluationFailed={evaluationFailed} />
      </div>
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
        <WhatWorkedCard turn={turn} />
        <ImprovementMomentsCard turn={turn} />
      </div>
    </div>
  );
}

/**
 * Convert backend snake_case issue types (off_track, missing_result, …)
 * into title-cased English. Generic title-case — works for any value the
 * backend returns, including legacy / unknown types.
 */
function formatIssueType(raw: string): string {
  return raw
    .split('_')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function InnerCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-raised p-5 h-full overflow-hidden flex flex-col">
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
      {children}
    </p>
  );
}

function QuestionAnswerCard({ turn }: { turn: TurnDetail }) {
  const fillerCount = turn.filler_word_count;
  return (
    <InnerCard>
      <Eyebrow>Question</Eyebrow>
      <p className="mt-2 text-lg leading-snug text-text">
        {turn.question_text}
      </p>

      <div className="mt-5 mb-2 flex items-baseline justify-between gap-3">
        <Eyebrow>Your answer</Eyebrow>
        {fillerCount > 0 && (
          <span className="text-xs text-text-subtle tabular-nums">
            {fillerCount} filler word{fillerCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {turn.transcript_text ? (
          <p className="text-sm leading-7 text-text-muted">
            {tokenizeTranscript(turn.transcript_text).map((tok, i) =>
              tok.kind === 'filler' ? (
                <span
                  key={i}
                  className="rounded-sm px-1"
                  style={{
                    background: 'color-mix(in srgb, var(--color-chart-2) 25%, transparent)',
                    color: 'var(--color-chart-2)',
                  }}
                  title={`Filler word: "${tok.canonical}"`}
                >
                  {tok.text}
                </span>
              ) : (
                <span key={i}>{tok.text}</span>
              ),
            )}
          </p>
        ) : (
          <p className="text-sm text-text-subtle">Transcript unavailable.</p>
        )}
      </div>
    </InnerCard>
  );
}

function ScoresTakeawayWinsCard({
  turn,
  evaluationFailed,
}: {
  turn: TurnDetail;
  evaluationFailed: boolean;
}) {
  const detail = turn.feedback_detail;
  const mainTakeaway = detail?.main_takeaway ?? turn.feedback ?? null;
  const quickWins = detail?.quick_wins ?? [];

  return (
    <InnerCard>
      <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto">
        <div>
          <Eyebrow>Scores</Eyebrow>
          {evaluationFailed ? (
            <div className="mt-3 rounded-md border border-border-strong p-3">
              <p className="text-sm text-text">Evaluation failed</p>
              <p className="mt-1 text-xs text-text-muted">
                The evaluator did not return scores for this turn.
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {SCORE_KEYS.map(([key, label]) => {
                const value = turn.scores[key];
                if (value == null) return null;
                return (
                  <ScoreRow key={key} label={label} value={value} color={SCORE_COLOR_MAP[key]} />
                );
              })}
            </div>
          )}
        </div>

        {mainTakeaway && (
          <div>
            <Eyebrow>Main takeaway</Eyebrow>
            <p className="mt-2 text-sm leading-6 text-text">{mainTakeaway}</p>
          </div>
        )}

        {quickWins.length > 0 && (
          <div>
            <Eyebrow>Quick wins</Eyebrow>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {quickWins.map((win) => (
                <li key={win} className="text-sm leading-6 text-text-muted">
                  {win}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </InnerCard>
  );
}

function ScoreRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)_2.5rem] items-center gap-3">
      <span className="text-sm text-text-muted truncate">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full"
          style={{ width: `${(value / 10) * 100}%`, background: color }}
        />
      </div>
      <span className="text-xs text-text-subtle tabular-nums text-right">{value}/10</span>
    </div>
  );
}

function WhatWorkedCard({ turn }: { turn: TurnDetail }) {
  const moments = turn.feedback_detail?.positive_moments ?? [];
  return (
    <InnerCard>
      <Eyebrow>What worked</Eyebrow>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        {moments.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Nothing notable flagged from this turn.
          </p>
        ) : (
          <ul className="flex flex-col gap-5">
            {moments.map((m, i) => (
              <li
                key={`${m.transcript_snippet}-${i}`}
                className="border-l-2 pl-4"
                style={{ borderColor: 'var(--color-chart-3)' }}
              >
                <p className="mb-1 text-xs text-text-subtle">You said</p>
                <p className="mb-3 text-sm italic leading-6 text-text">
                  &ldquo;{m.transcript_snippet}&rdquo;
                </p>
                <p className="mb-1.5 text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">Why this helped: </span>
                  {m.why_this_helped}
                </p>
                <p className="text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">Keep doing this: </span>
                  {m.keep_doing}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </InnerCard>
  );
}

function ImprovementMomentsCard({ turn }: { turn: TurnDetail }) {
  const moments =
    turn.feedback_detail?.improvement_moments ??
    turn.feedback_detail?.coaching_moments ??
    [];
  const headingId = useId();
  return (
    <InnerCard>
      <p
        id={headingId}
        className="text-eyebrow uppercase tracking-eyebrow text-text-muted"
      >
        Improvement moments
      </p>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        {moments.length === 0 ? (
          <p className="text-sm text-text-subtle">No improvement moments flagged.</p>
        ) : (
          <ul className="flex flex-col gap-5" aria-labelledby={headingId}>
            {moments.map((m, i) => (
              <li
                key={`${m.transcript_snippet}-${i}`}
                className="border-l-2 border-accent/45 pl-4"
              >
                <span className="inline-block rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                  {formatIssueType(m.issue_type)}
                </span>
                <p className="mt-2 mb-1 text-xs text-text-subtle">You said</p>
                <p className="mb-3 text-sm italic leading-6 text-text">
                  &ldquo;{m.transcript_snippet}&rdquo;
                </p>
                <p className="mb-1.5 text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">Why this weakened the answer: </span>
                  {m.why_this_weakened}
                </p>
                <p className="text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">How to strengthen it: </span>
                  {m.how_to_strengthen}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </InnerCard>
  );
}
