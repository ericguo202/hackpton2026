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
 */

type Props = {
  question: string;
  audioUrl: string;
  questionNum?: number;
  onEnded?: () => void;
};

export default function QuestionPlayer({ question, audioUrl, questionNum = 1, onEnded }: Props) {
  return (
    <div className="mt-12 max-w-[56ch]">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-4">
        Question {questionNum}
      </p>
      <p className="font-display text-xl md:text-2xl text-text leading-snug">
        {question}
      </p>
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
