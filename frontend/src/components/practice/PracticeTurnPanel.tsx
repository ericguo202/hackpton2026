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
import type { InterviewSummary } from '../../lib/faceHeuristics';
import type { AnalyzerDiagnostics } from '../../hooks/useFaceAnalyzer';
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
import { ImproveNextCard } from './ImproveNextCard';
import { VideoReplayCard } from './VideoReplayCard';

export type PracticeTurnReplay = {
  replayUrl: string | null;
  audioReplayUrl: string | null;
  cvSummary: InterviewSummary | null;
  analyzerDiagnostics: AnalyzerDiagnostics;
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

  return (
    <MomentFlashContext.Provider value={flash}>
    <div className="flex flex-col gap-4 p-6">
      {isOpeningTurn && sessionId && (
        <div className="flex justify-end">
          <SaveQuestionButton
            sessionId={sessionId}
            alreadySaved={savedQuestionId != null}
            evaluated={!evaluationFailed}
            sessionCompleted={sessionCompleted}
          />
        </div>
      )}
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
    </MomentFlashContext.Provider>
  );
}
