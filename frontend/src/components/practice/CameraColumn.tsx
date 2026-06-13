import { CameraPreview } from '../CameraPreview';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/** A timed recording-length notice shown UNDER the camera box. `warning` is the
    gentle 4:00 heads-up; `countdown` is the live 4:30→5:00 auto-stop ticker.
    `text` is the fully-formatted message (Practice owns the wording so the
    auto-submit vs. manual phrasing lives next to the mode flag). */
export type RecordingNotice = {
  tone: 'warning' | 'countdown';
  text: string;
};

interface Props {
  videoStream: MediaStream | null;
  recorderState: 'idle' | 'recording' | 'stopped';
  replayUrl: string | null;
  audioUrl: string | null;
  showPreview: boolean;
  /** Submission in flight — the preview Submit/Re-record must lock so a
      double-click or stray Re-record can't race the in-flight POST. */
  submitting: boolean;
  /** Final turn (no follow-up to come) — drives the placeholder copy shown
      while the recording is submitting: scoring vs. follow-up-incoming. */
  isFinalTurn: boolean;
  /** Recording-length warning / countdown, or null when neither applies.
      Rendered directly under the camera box (never overlaid). */
  recordingNotice: RecordingNotice | null;
  /** One-time heads-up shown under the box while the FIRST question plays
      (turn 1, pre-recording) so the candidate knows the 5-minute cap before
      they start. Hidden once recording begins. */
  firstTurnHint: boolean;
  onSubmitPreview: () => void;
  onReRecordPreview: () => void;
  className?: string;
}

export function CameraColumn({
  videoStream,
  recorderState,
  replayUrl,
  audioUrl,
  showPreview,
  submitting,
  isFinalTurn,
  recordingNotice,
  firstTurnHint,
  onSubmitPreview,
  onReRecordPreview,
  className,
}: Props) {
  return (
    <div
      className={cn(
        // Mobile: column hugs its content so it sits directly under the
        // question column without a tall empty slot. Desktop: fills the
        // grid row and vertically centers around the camera box.
        'flex flex-col items-center gap-4 p-6',
        'min-[900px]:h-full min-[900px]:justify-center min-[900px]:overflow-y-auto min-[900px]:p-8',
        className,
      )}
    >
      {/* Box wrapper, sized to the box. `relative` so the under-box notices
          can hang off the BOTTOM of the box on desktop (absolute, `top-full`)
          instead of joining the column's centered flow — that keeps the camera
          box itself vertically centered on the page whether or not a notice is
          showing, so it no longer jumps up when the notice appears. On mobile
          the notices stay in normal flow (`mt-4`). */}
      <div className="relative w-full min-[900px]:w-[45vw]">
        {/* Camera box: full width on mobile, locked to 45vw on desktop so the
            column-ratio toggle (33/67 ↔ 25/50/25) never resizes the box and
            there's horizontal breathing room when the transcript column opens
            (camera column is 50vw, box is 45vw → ~2.5vw gutter on each side).
            The empty/declined panel reads as a powered-down screen by inverting
            the surface: a dark ink panel on the cream light theme, a near-white
            panel on the espresso dark theme — so it never blends into the page. */}
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-primary-700 dark:bg-primary-100">
          {showPreview && replayUrl ? (
            <video src={replayUrl} controls className="h-full w-full object-cover" />
          ) : videoStream ? (
            <CameraPreview stream={videoStream} />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-6">
              <p className="text-center text-sm text-primary-100 dark:text-primary-700">
                {submitting
                  ? isFinalTurn
                    ? 'Evaluating your recording…'
                    : 'Audio/video recording will restart when the follow-up question finishes playing.'
                  : recorderState === 'idle'
                    ? 'Recording will start once the question audio ends.'
                    : 'Webcam not enabled — audio recorded only.'}
              </p>
            </div>
          )}
        </div>

        {/* Pre-start heads-up — UNDER the box, while the first question plays.
            Mutually exclusive with `recordingNotice` (idle vs. recording). */}
        {firstTurnHint && (
          <p className="mt-4 w-full text-center text-sm text-text-muted min-[900px]:absolute min-[900px]:inset-x-0 min-[900px]:top-full">
            Each answer can be up to 5 minutes — recording stops automatically.
          </p>
        )}

        {/* Recording-length notice — UNDER the box, matching its width, never
            overlaid. Only present while recording (Practice gates the value). */}
        {recordingNotice && (
          <p
            role="status"
            aria-live="polite"
            className={cn(
              'mt-4 w-full text-center text-sm min-[900px]:absolute min-[900px]:inset-x-0 min-[900px]:top-full',
              recordingNotice.tone === 'countdown'
                ? 'font-medium text-text'
                : 'text-text-muted',
            )}
          >
            {recordingNotice.text}
          </p>
        )}
      </div>

      {showPreview && !replayUrl && audioUrl && (
        <audio src={audioUrl} controls className="w-full min-[900px]:w-[45vw]" />
      )}

      {showPreview && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            onClick={onSubmitPreview}
            disabled={submitting}
          >
            Submit answer
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={onReRecordPreview}
            disabled={submitting}
          >
            Re-record
          </Button>
        </div>
      )}

    </div>
  );
}
