import { cn } from '../../lib/utils';

interface Props {
  questionText: string;
  audioUrl: string;
  showQuestionText: boolean;
  replayKey: number;
  onAudioEnded: () => void;
  className?: string;
}

export function QuestionColumn({
  questionText,
  audioUrl,
  showQuestionText,
  replayKey,
  onAudioEnded,
  className,
}: Props) {
  return (
    <div
      className={cn(
        // On mobile the column hugs its content so the camera below isn't
        // pushed far down by an unused `h-full` slot. On desktop it fills
        // the grid row and vertically centers its content.
        'flex flex-col p-6',
        'min-[900px]:h-full min-[900px]:justify-center min-[900px]:overflow-y-auto min-[900px]:border-r min-[900px]:border-border min-[900px]:p-12',
        className,
      )}
    >
      <p className="mb-4 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Question
      </p>
      {/* Invisible underlay holds the real question's wrapped height; the
          visible overlay swaps between the real text and a placeholder so
          toggling never resizes the column. */}
      <div className="relative">
        <p
          aria-hidden="true"
          className="invisible font-display text-xl leading-snug md:text-2xl"
        >
          {questionText}
        </p>
        <p
          className={cn(
            'absolute inset-0 font-display text-xl leading-snug md:text-2xl',
            showQuestionText ? 'text-text' : 'italic text-text-subtle',
          )}
        >
          {showQuestionText ? questionText : 'Listen to the question, then answer.'}
        </p>
      </div>
      <audio
        key={replayKey}
        src={audioUrl}
        autoPlay
        controls
        onEnded={onAudioEnded}
        className="mt-6 w-full"
      />
    </div>
  );
}
