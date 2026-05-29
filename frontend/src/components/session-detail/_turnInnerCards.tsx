/**
 * Shared building blocks for "one turn" inner cards.
 *
 * Originally lived inline inside `TurnPanel.tsx` (SessionDetail). Extracted
 * so the Practice Results phase can compose the same cards into a different
 * row arrangement (3 rows × 2 cols, with Practice-only Video + Improve Next
 * cards inserted) without re-implementing the question / transcript /
 * positive moments / improvement moments rendering.
 *
 * Two flavors of export:
 *   - Whole cards (`QuestionAnswerCard`, `WhatWorkedCard`,
 *     `ImprovementMomentsCard`) — already wrapped in `InnerCard`. Drop into
 *     a grid cell directly.
 *   - Section renderers (`ScoresSection`, `MainTakeawaySection`,
 *     `QuickWinsSection`) — bare JSX, no card wrapper. Caller stacks them
 *     inside their own `InnerCard` so SessionDetail can keep its combined
 *     Scores+Takeaway+Wins card and Practice can stack Takeaway+Wins
 *     without Scores (scores live in Practice's Overview tile grid).
 */

import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import type { TurnDetail } from '../../types/history';
import { tokenizeTranscript } from '../../lib/fillerWords';
import { SCORE_COLOR_MAP, SCORE_KEYS, formatIssueType } from './_helpers';

/* ------------------------------------------------------------------ */
/* Primitives                                                         */
/* ------------------------------------------------------------------ */

/** The lighter beige paper-insert card that sits inside the dark folder. */
export function InnerCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-raised p-5 h-full overflow-hidden flex flex-col">
      {children}
    </div>
  );
}

/** Small uppercase section label. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
      {children}
    </p>
  );
}

/** Per-dimension score bar row used inside `ScoresSection`. */
export function ScoreRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
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

/* ------------------------------------------------------------------ */
/* Whole cards                                                        */
/* ------------------------------------------------------------------ */

export function QuestionAnswerCard({ turn }: { turn: TurnDetail }) {
  const fillerCount = turn.filler_word_count;
  const hasTranscript = !!turn.transcript_text;
  // Mobile-only collapse. Below 900px the transcript can dominate the page
  // and push the audio/scores/feedback far down. Default collapsed; the
  // `min-[900px]:block` override keeps desktop unaffected.
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const transcriptId = useId();
  return (
    <InnerCard>
      <Eyebrow>Question</Eyebrow>
      <p className="mt-2 text-lg leading-snug text-text">
        {turn.question_text}
      </p>

      <div className="mt-5 mb-2 flex items-baseline justify-between gap-3">
        <Eyebrow>Your answer</Eyebrow>
        <div className="flex items-baseline gap-3">
          {fillerCount > 0 && (
            <span className="text-xs text-text-subtle tabular-nums">
              {fillerCount} filler word{fillerCount === 1 ? '' : 's'}
            </span>
          )}
          {hasTranscript && (
            <button
              type="button"
              onClick={() => setIsTranscriptOpen((v) => !v)}
              className="min-[900px]:hidden inline-flex items-center gap-1 text-xs text-accent underline-offset-2 hover:underline"
              aria-expanded={isTranscriptOpen}
              aria-controls={transcriptId}
            >
              {isTranscriptOpen ? 'Hide transcript' : 'Show transcript'}
              {isTranscriptOpen ? (
                <ChevronUp size={14} aria-hidden />
              ) : (
                <ChevronDown size={14} aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>
      <div
        id={transcriptId}
        className={`flex-1 min-h-0 overflow-y-auto ${
          hasTranscript && !isTranscriptOpen ? 'hidden min-[900px]:block' : ''
        }`}
      >
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

export function WhatWorkedCard({ turn }: { turn: TurnDetail }) {
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

export function ImprovementMomentsCard({ turn }: { turn: TurnDetail }) {
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

/* ------------------------------------------------------------------ */
/* Section renderers (no card wrapper — caller composes)               */
/* ------------------------------------------------------------------ */

export function ScoresSection({
  turn,
  evaluationFailed,
}: {
  turn: TurnDetail;
  evaluationFailed: boolean;
}) {
  return (
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
  );
}

export function MainTakeawaySection({ turn }: { turn: TurnDetail }) {
  const mainTakeaway = turn.feedback_detail?.main_takeaway ?? turn.feedback ?? null;
  if (!mainTakeaway) return null;
  return (
    <div>
      <Eyebrow>Main takeaway</Eyebrow>
      <p className="mt-2 text-sm leading-6 text-text">{mainTakeaway}</p>
    </div>
  );
}

export function DeliveryFeedbackSection({ turn }: { turn: TurnDetail }) {
  const deliveryFeedback = turn.feedback_detail?.delivery_feedback;
  if (!deliveryFeedback) return null;

  const rows: Array<[string, string]> = [];
  if (deliveryFeedback.eye_contact) {
    rows.push(['Eye contact', deliveryFeedback.eye_contact]);
  }
  if (deliveryFeedback.alignment) {
    rows.push(['Alignment', deliveryFeedback.alignment]);
  }
  if (deliveryFeedback.posture) {
    rows.push(['Posture', deliveryFeedback.posture]);
  }
  if (deliveryFeedback.expression) {
    rows.push(['Expression', deliveryFeedback.expression]);
  }

  return (
    <div>
      <Eyebrow>Delivery cues</Eyebrow>
      <p className="mt-2 text-sm leading-6 text-text">
        {deliveryFeedback.summary}
      </p>
      {rows.length > 0 && (
        <dl className="mt-3 flex flex-col gap-2">
          {rows.map(([label, detail]) => (
            <div key={label} className="border-l-2 pl-3" style={{ borderColor: 'var(--color-chart-6)' }}>
              <dt className="text-xs text-text-subtle">{label}</dt>
              <dd className="text-sm leading-6 text-text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function QuickWinsSection({ turn }: { turn: TurnDetail }) {
  const quickWins = turn.feedback_detail?.quick_wins ?? [];
  if (quickWins.length === 0) return null;
  return (
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
  );
}
