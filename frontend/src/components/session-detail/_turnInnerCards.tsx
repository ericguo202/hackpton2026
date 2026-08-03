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
import { questionCategoryLabel } from '../../types/session';
import type { TranscriptToken } from '../../lib/fillerWords';
import { segmentTranscriptByImprovements } from '../../lib/transcriptHighlight';
import FillerRateBar from './FillerRateBar';
import SpeakingPaceBar from './SpeakingPaceBar';
import { useMomentFlash } from './_momentFlash';
import { useAskTutor } from './ask-tutor/_askTutor';
import AskAboutThisButton from './ask-tutor/AskAboutThisButton';
import {
  formatIssueType,
  improvementMomentsOf,
  num,
  positiveMomentsOf,
} from './_helpers';
import { scoreDimensionsFor } from '../../lib/scoreDimensions';

/* ------------------------------------------------------------------ */
/* Primitives                                                         */
/* ------------------------------------------------------------------ */

/** Sunken inset panel inside the folder card (page → card → well). */
export function InnerCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-sunken p-5 h-full overflow-hidden flex flex-col">
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

/** Render one transcript token — filler runs get a yellow highlighter wash
 *  (the second-tier "could improve" note, below the critique-red "should fix"),
 *  plain runs render as-is. A true highlighter: yellow sits BEHIND the normal
 *  ink/cream text (not as the text color — yellow type fails contrast), so it
 *  reads cleanly even nested inside a critique-red improvement span. The wash
 *  runs a little heavier than the red (40% vs 25%) because yellow needs more
 *  opacity than red to register. */
function renderTranscriptToken(tok: TranscriptToken, key: string) {
  if (tok.kind === 'filler') {
    return (
      <span
        key={key}
        className="rounded-sm px-1"
        style={{
          background: 'color-mix(in srgb, var(--color-filler) 40%, transparent)',
          color: 'var(--color-text)',
        }}
        title={`Filler word: "${tok.canonical}"`}
      >
        {tok.text}
      </span>
    );
  }
  return <span key={key}>{tok.text}</span>;
}

export function QuestionAnswerCard({ turn }: { turn: TurnDetail }) {
  const fillerCount = turn.filler_word_count;
  const hasTranscript = !!turn.transcript_text;
  const { triggerFlash } = useMomentFlash();
  const moments = improvementMomentsOf(turn);
  const segments = segmentTranscriptByImprovements(
    turn.transcript_text,
    moments.map((m, i) => ({ snippet: m.transcript_snippet, momentIndex: i })),
  );
  // Mobile-only collapse. Below 900px the transcript can dominate the page
  // and push the audio/scores/feedback far down. Default collapsed; the
  // `min-[900px]:block` override keeps desktop unaffected.
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const transcriptId = useId();
  return (
    <InnerCard>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>{turn.is_followup ? 'Follow-up question' : 'Question'}</Eyebrow>
        <span className="rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-text-muted">
          {questionCategoryLabel(turn.question_category)}
        </span>
      </div>
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
              className="min-[900px]:hidden inline-flex items-center gap-1 text-xs text-link underline-offset-2 hover:underline"
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
            {segments.map((seg, si) =>
              seg.kind === 'improvement' ? (
                // A `<span role="button">` (not a real <button>) so the
                // highlight flows inline and fragments across line breaks like
                // the filler spans; an atomic <button> would sit centered on
                // its own line. `box-decoration-clone` rounds each line fragment.
                <span
                  key={si}
                  role="button"
                  tabIndex={0}
                  onClick={() => triggerFlash(seg.momentIndex)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerFlash(seg.momentIndex);
                    }
                  }}
                  className="cursor-pointer rounded-sm box-decoration-clone bg-critique/25 px-0.5 text-text transition-colors hover:bg-critique/40 dark:bg-critique/40 dark:hover:bg-critique-hover/40 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                  title="Improvement moment — click to view"
                  aria-label={`Jump to improvement moment ${seg.momentIndex + 1}`}
                >
                  {seg.tokens.map((tok, ti) =>
                    renderTranscriptToken(tok, `${si}-${ti}`),
                  )}
                </span>
              ) : (
                seg.tokens.map((tok, ti) =>
                  renderTranscriptToken(tok, `${si}-${ti}`),
                )
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

/**
 * Pending/failed status box shared by the score + feedback cards so they all
 * flip to the same state together while the final-turn evaluation finishes.
 * `pending` true → spinner + "Scoring in progress"; false → "Evaluation failed".
 * Callers pass card-specific `pendingHint`/`failedHint` copy.
 */
export function EvalStatusNotice({
  pending,
  pendingHint = 'Feedback is still being generated for this turn.',
  failedHint = 'The evaluator did not return scores for this turn.',
  className = 'mt-3',
}: {
  pending: boolean;
  pendingHint?: string;
  failedHint?: string;
  className?: string;
}) {
  return (
    <div className={`${className} rounded-md border border-border-strong p-3`}>
      {pending ? (
        <>
          <div className="flex items-center gap-2">
            <span
              role="status"
              aria-label="Loading"
              className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent text-text"
            />
            <p className="text-sm text-text">Scoring in progress</p>
          </div>
          <p className="mt-1 text-xs text-text-muted">{pendingHint}</p>
        </>
      ) : (
        <>
          <p className="text-sm text-text">Evaluation failed</p>
          <p className="mt-1 text-xs text-text-muted">{failedHint}</p>
        </>
      )}
    </div>
  );
}

export function WhatWorkedCard({
  turn,
  evaluationPending = false,
  evaluationFailed = false,
}: {
  turn: TurnDetail;
  evaluationPending?: boolean;
  evaluationFailed?: boolean;
}) {
  const moments = positiveMomentsOf(turn);
  return (
    <InnerCard>
      <Eyebrow>What worked</Eyebrow>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        {evaluationPending || evaluationFailed ? (
          <EvalStatusNotice
            pending={evaluationPending}
            className="mt-0"
            pendingHint="Highlights of what worked will appear once scoring finishes."
            failedHint="What worked could not be generated because the evaluator did not return scores."
          />
        ) : moments.length === 0 ? (
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

export function ImprovementMomentsCard({
  turn,
  evaluationPending = false,
  evaluationFailed = false,
}: {
  turn: TurnDetail;
  evaluationPending?: boolean;
  evaluationFailed?: boolean;
}) {
  const moments = improvementMomentsOf(turn);
  const headingId = useId();
  const { flash, domIdFor } = useMomentFlash();
  // Present only when a turn mounts the AskTutor provider (SessionDetail);
  // null on Practice Results, which reuses this card without the tutor.
  const tutor = useAskTutor();
  return (
    <InnerCard>
      <p
        id={headingId}
        className="text-eyebrow uppercase tracking-eyebrow text-text-muted"
      >
        Improvement moments
      </p>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        {evaluationPending || evaluationFailed ? (
          <EvalStatusNotice
            pending={evaluationPending}
            className="mt-0"
            pendingHint="Improvement moments will appear once scoring finishes."
            failedHint="Improvement moments could not be generated because the evaluator did not return scores."
          />
        ) : moments.length === 0 ? (
          <p className="text-sm text-text-subtle">No improvement moments flagged.</p>
        ) : (
          <ul className="flex flex-col gap-5" aria-labelledby={headingId}>
            {moments.map((m, i) => {
              const isFlashing = flash?.index === i;
              return (
              <li
                key={`${m.transcript_snippet}-${i}${
                  isFlashing ? `-flash-${flash.nonce}` : ''
                }`}
                id={domIdFor(i)}
                tabIndex={-1}
                className={`border-l-2 border-critique/45 pl-4 ${
                  isFlashing ? 'moment-flash' : ''
                }`}
              >
                <span className="inline-block rounded-full bg-critique/10 px-2 py-0.5 text-xs text-text dark:text-critique">
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
                {tutor && (
                  <div className="mt-2.5">
                    <AskAboutThisButton
                      onClick={() => tutor.openAbout(m.transcript_snippet)}
                    />
                  </div>
                )}
              </li>
              );
            })}
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
  evaluationPending = false,
}: {
  turn: TurnDetail;
  evaluationFailed: boolean;
  evaluationPending?: boolean;
}) {
  return (
    <div>
      <Eyebrow>Scores</Eyebrow>
      {evaluationPending || evaluationFailed ? (
        <EvalStatusNotice pending={evaluationPending} />
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {/* Labels are resolved from THIS turn's question category (STAR vs
              Motivation & Fit name the five generic slots differently). */}
          {scoreDimensionsFor(turn.question_category).map(({ key, label, color }) => {
            const value = turn.scores[key];
            if (value == null) return null;
            return <ScoreRow key={key} label={label} value={value} color={color} />;
          })}
        </div>
      )}
      {/* Delivery metrics sit under the score stack. Both are transcript-derived,
          so they show even when the evaluation failed (no scores above). */}
      <div className="mt-2 flex flex-col gap-2">
        <FillerRateBar rate={num(turn.filler_word_rate)} variant="row" />
        <SpeakingPaceBar wpm={turn.speaking_pace_wpm} variant="row" />
      </div>
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
