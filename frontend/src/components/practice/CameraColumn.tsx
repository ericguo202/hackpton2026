import { CameraPreview } from '../CameraPreview';
import { FlowHoverButton } from '../ui/flow-hover-button';
import { cn } from '../../lib/utils';

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
      {/* Camera box: full width on mobile, locked to 45vw on desktop so the
          column-ratio toggle (33/67 ↔ 25/50/25) never resizes the box and
          there's horizontal breathing room when the transcript column opens
          (camera column is 50vw, box is 45vw → ~2.5vw gutter on each side).
          Dark `bg-accent` so the empty/declined states read as a powered-down
          video panel instead of blending into the cream page surface. */}
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-accent min-[900px]:w-[45vw]">
        {showPreview && replayUrl ? (
          <video src={replayUrl} controls className="h-full w-full object-cover" />
        ) : videoStream ? (
          <CameraPreview stream={videoStream} />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6">
            <p className="text-center text-sm text-accent-fg">
              {submitting
                ? isFinalTurn
                  ? 'Evaluating your recording…'
                  : 'Audio/video recording will restart when the follow-up question finishes playing.'
                : recorderState === 'idle'
                  ? 'Camera will start once the question audio ends.'
                  : 'Webcam not enabled — audio recorded only.'}
            </p>
          </div>
        )}
      </div>

      {showPreview && !replayUrl && audioUrl && (
        <audio src={audioUrl} controls className="w-full min-[900px]:w-[45vw]" />
      )}

      {showPreview && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <FlowHoverButton
            variant="dark"
            type="button"
            onClick={onSubmitPreview}
            disabled={submitting}
          >
            Submit answer
          </FlowHoverButton>
          <FlowHoverButton
            type="button"
            onClick={onReRecordPreview}
            disabled={submitting}
          >
            Re-record
          </FlowHoverButton>
        </div>
      )}

    </div>
  );
}
