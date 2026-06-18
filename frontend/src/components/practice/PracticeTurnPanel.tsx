/**
 * One turn rendered inside Practice's Results-phase folder card.
 *
 * Three rows × two columns at ≥900px; single column stack below 900px.
 *
 *   Row 1  →  Q+A           |  Video replay
 *   Row 2  →  Takeaway+Wins |  What worked
 *   Row 3  →  Improvement   |  Improve next
 *
 * Row 1 is height-clamped so the video card never grows into a long
 * empty rectangle: long transcripts scroll inside the Q+A card's own
 * `flex-1 min-h-0 overflow-y-auto` region. Rows 2 and 3 size to their
 * own content, with siblings height-matched via grid `items-stretch` +
 * `InnerCard`'s `h-full`.
 *
 * The Q+A / What worked / Improvement / Takeaway / Quick wins pieces all
 * reuse the SessionDetail inner-card primitives from
 * `components/session-detail/_turnInnerCards.tsx`. The Practice-only
 * Video and Improve-next cards live next to this file under
 * `components/practice/`.
 */

import type { TurnDetail } from '../../types/history';
import SaveQuestionButton from '../SaveQuestionButton';
import {
  DeliveryFeedbackSection,
  ImprovementMomentsCard,
  InnerCard,
  MainTakeawaySection,
  QuestionAnswerCard,
  QuickWinsSection,
  ScoresSection,
  WhatWorkedCard,
} from '../session-detail/_turnInnerCards';
import {
  MomentFlashContext,
  useProvideMomentFlash,
} from '../session-detail/_momentFlash';
import { AskTutorContext, useProvideAskTutor } from '../session-detail/ask-tutor/_askTutor';
import AskTutorButton from '../session-detail/ask-tutor/AskTutorButton';
import AskTutorChat from '../session-detail/ask-tutor/AskTutorChat';
import { ImproveNextCard } from './ImproveNextCard';
import { VideoReplayCard } from './VideoReplayCard';

export type PracticeTurnReplay = {
  replayUrl: string | null;
  audioReplayUrl: string | null;
};

type Props = {
  turn: TurnDetail;
  turnNum: number;
  replay: PracticeTurnReplay;
  sessionCompleted: boolean;
  /** Present once the session is persisted (final-turn refetch). Enables Save. */
  sessionId?: string;
  savedQuestionId?: string | null;
};

export function PracticeTurnPanel({
  turn,
  turnNum,
  replay,
  sessionCompleted,
  sessionId,
  savedQuestionId,
}: Props) {
  const evaluationFailed = turn.scores.structure === null;
  const evaluationPending = evaluationFailed && !sessionCompleted;
  const isOpeningTurn = turnNum === 1 && !turn.is_followup;
  const flash = useProvideMomentFlash(turn.id);
  const askTutor = useProvideAskTutor();

  return (
    <MomentFlashContext.Provider value={flash}>
    <AskTutorContext.Provider value={askTutor}>
    <div className="flex flex-col gap-4 p-6">
      {/* Action row: Save (opening turn only) + Ask Tutor (every turn, but
          disabled until this turn finishes scoring). */}
      <div className="flex items-start justify-end gap-2">
        {isOpeningTurn && sessionId && (
          <SaveQuestionButton
            sessionId={sessionId}
            alreadySaved={savedQuestionId != null}
            evaluated={!evaluationFailed}
            sessionCompleted={sessionCompleted}
          />
        )}
        <AskTutorButton disabled={evaluationPending} />
      </div>
      {/* Row 1 — clamp the height so the video card stays compact even when
          the transcript is short, and the transcript scrolls when it's long. */}
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:h-[clamp(22rem,30vw,28rem)]">
        <QuestionAnswerCard turn={turn} />
        <VideoReplayCard
          replayUrl={replay.replayUrl}
          audioReplayUrl={replay.audioReplayUrl}
          turnNum={turnNum}
        />
      </div>

      {/* Row 2 — Scores+Takeaway+Wins | What worked. */}
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
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
        <WhatWorkedCard
          turn={turn}
          evaluationPending={evaluationPending}
          evaluationFailed={evaluationFailed}
        />
      </div>

      {/* Row 3 — Improvement moments | Improve next. */}
      <div className="flex flex-col gap-4 min-[900px]:grid min-[900px]:grid-cols-2">
        <ImprovementMomentsCard
          turn={turn}
          evaluationPending={evaluationPending}
          evaluationFailed={evaluationFailed}
        />
        <ImproveNextCard
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
