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
import { MomentFlashContext, useProvideMomentFlash } from './_momentFlash';
import { AskTutorContext, useProvideAskTutor } from './ask-tutor/_askTutor';
import AskTutorButton from './ask-tutor/AskTutorButton';
import AskTutorChat from './ask-tutor/AskTutorChat';
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
  /** False while the session is still finalizing — null scores mean
   *  "Scoring in progress", not "Evaluation failed". */
  sessionCompleted: boolean;
  /** Set so an opening turn can offer the Save-question control. */
  sessionId?: string;
};

export default function TurnPanel({
  turn,
  sessionCompleted,
  sessionId,
}: Props) {
  const evaluationFailed = turn.scores.structure === null;
  const evaluationPending = evaluationFailed && !sessionCompleted;
  // Every opening question is saveable (turn 1 + mid-session story-block
  // openings); follow-ups are not.
  const isOpeningTurn = !turn.is_followup;
  const flash = useProvideMomentFlash(turn.id);
  const askTutor = useProvideAskTutor();

  return (
    <MomentFlashContext.Provider value={flash}>
    <AskTutorContext.Provider value={askTutor}>
    <div className="flex flex-col gap-4 p-6">
      {/* Action row: Save (opening turn only) + Ask Tutor (every turn). */}
      <div className="flex items-start justify-end gap-2">
        {isOpeningTurn && sessionId && (
          <SaveQuestionButton
            sessionId={sessionId}
            turnId={turn.id}
            questionText={turn.question_text}
            evaluated={!evaluationFailed}
            sessionCompleted={sessionCompleted}
          />
        )}
        <AskTutorButton />
      </div>
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
        <QuestionAnswerCard turn={turn} />
        <InnerCard>
          <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto">
            <ScoresSection
              turn={turn}
              evaluationFailed={evaluationFailed}
              evaluationPending={evaluationPending}
            />
            <MainTakeawaySection turn={turn} />
            <DeliveryFeedbackSection turn={turn} />
            <QuickWinsSection turn={turn} />
          </div>
        </InnerCard>
      </div>
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
        <WhatWorkedCard
          turn={turn}
          evaluationPending={evaluationPending}
          evaluationFailed={evaluationFailed}
        />
        <ImprovementMomentsCard
          turn={turn}
          evaluationPending={evaluationPending}
          evaluationFailed={evaluationFailed}
        />
      </div>
    </div>
    <AskTutorChat
      subtitle={`About Turn ${turn.turn_number}`}
      sessionId={sessionId}
      turnId={turn.id}
    />
    </AskTutorContext.Provider>
    </MomentFlashContext.Provider>
  );
}
