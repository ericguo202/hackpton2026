/**
 * One turn rendered inside the SessionDetail folder card.
 *
 * Below 900px: single column, cards stack in the order:
 *   Q+A → Scores+Takeaway+QuickWins → What Worked → Improvement Moments.
 *
 * At ≥900px: two independent row grids (NOT a single `auto-rows-fr` grid —
 * that forces both rows to the taller, leaving huge empty gutters under
 * the shorter row). Cards inside each row share height via grid
 * `items-stretch` + `InnerCard`'s `h-full`.
 *
 * Evaluation-failed turns (turn.scores.structure === null) collapse the
 * Scores section to a one-line "Evaluation failed" notice — the rest of
 * the card still renders the transcript, takeaway, and any moments that
 * were persisted.
 *
 * The inner cards and section renderers live in `_turnInnerCards.tsx` so
 * the Practice Results phase can compose them into a different layout
 * (3 rows including Practice-only Video + Improve Next cards).
 */

import type { TurnDetail } from '../../types/history';
import SaveQuestionButton from '../SaveQuestionButton';
import {
  DeliveryFeedbackSection,
  InnerCard,
  ImprovementMomentsCard,
  MainTakeawaySection,
  QuestionAnswerCard,
  QuickWinsSection,
  ScoresSection,
  WhatWorkedCard,
} from './_turnInnerCards';

type Props = {
  turn: TurnDetail;
  /** Set on the opening turn so it can offer the Save-question control. */
  sessionId?: string;
  savedQuestionId?: string | null;
};

export default function TurnPanel({ turn, sessionId, savedQuestionId }: Props) {
  const evaluationFailed = turn.scores.structure === null;
  // The opening question (turn 1, non-followup) is the only saveable one.
  const isOpeningTurn = turn.turn_number === 1 && !turn.is_followup;

  return (
    <div className="flex flex-col gap-4 p-6">
      {isOpeningTurn && sessionId && (
        <div className="flex justify-end">
          <SaveQuestionButton
            sessionId={sessionId}
            alreadySaved={savedQuestionId != null}
            evaluated={!evaluationFailed}
          />
        </div>
      )}
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
        <QuestionAnswerCard turn={turn} />
        <InnerCard>
          <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto">
            <ScoresSection turn={turn} evaluationFailed={evaluationFailed} />
            <MainTakeawaySection turn={turn} />
            <DeliveryFeedbackSection turn={turn} />
            <QuickWinsSection turn={turn} />
          </div>
        </InnerCard>
      </div>
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
        <WhatWorkedCard turn={turn} />
        <ImprovementMomentsCard turn={turn} />
      </div>
    </div>
  );
}
