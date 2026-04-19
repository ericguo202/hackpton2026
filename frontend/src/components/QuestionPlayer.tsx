/**
 * `QuestionPlayer` — renders a single interview question with its TTS audio.
 *
 * Consumed by `Home.tsx` once `POST /api/v1/sessions` returns. The audio
 * source is a `data:audio/mpeg;base64,...` URL produced by the backend
 * (ElevenLabs → base64), so no network fetch happens when the element
 * mounts — it plays straight from the response payload.
 *
 * `autoPlay` works because mounting happens in the same task as the
 * user's click on "Begin session", which counts as a user gesture in
 * Chrome/Edge/Firefox. Safari may still block; `controls` is the
 * explicit fallback — the user can tap play.
 *
 * `showQuestion` hides the transcript so the candidate has to rely on
 * the audio — some users want that pressure. Audio always plays.
 */

type Props = {
  question: string;
  audioUrl: string;
  questionNum?: number;
  onEnded?: () => void;
  showQuestion?: boolean;
  onToggleShowQuestion?: () => void;
};

export default function QuestionPlayer({
  question,
  audioUrl,
  questionNum = 1,
  onEnded,
  showQuestion = true,
  onToggleShowQuestion,
}: Props) {
  const toggleLabel = showQuestion ? 'Hide question text' : 'Show question text';
  return (
    <div className="mt-12 max-w-[56ch]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Question {questionNum}
        </p>
        {onToggleShowQuestion && (
          <button
            type="button"
            onClick={onToggleShowQuestion}
            aria-pressed={!showQuestion}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {showQuestion ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        )}
      </div>
      {showQuestion ? (
        <p className="font-display text-xl md:text-2xl text-text leading-snug">
          {question}
        </p>
      ) : (
        <p className="font-display text-xl md:text-2xl text-text-subtle italic leading-snug">
          Listen to the question, then answer.
        </p>
      )}
      <audio
        src={audioUrl}
        autoPlay
        controls
        onEnded={onEnded}
        className="mt-6 w-full"
      />
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a17.65 17.65 0 0 1-3.17 4.19" />
      <path d="M6.61 6.61A17.65 17.65 0 0 0 2 12s3.5 7 10 7a10.94 10.94 0 0 0 5.39-1.39" />
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
