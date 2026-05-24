import type { FeedbackDetail } from '../types/session';

type Props = {
  feedback: FeedbackDetail | null | undefined;
  fallback?: string | null;
};

export default function StructuredFeedback({ feedback, fallback }: Props) {
  if (!feedback) {
    return fallback ? (
      <p className="text-[15px] leading-7 text-text">{fallback}</p>
    ) : null;
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="mb-2 text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Main takeaway
        </p>
        <p className="text-[15px] leading-7 text-text">{feedback.main_takeaway}</p>
      </div>

      {feedback.coaching_moments.length > 0 && (
        <div>
          <p className="mb-4 text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Coaching moments
          </p>
          <div className="space-y-5">
            {feedback.coaching_moments.map((moment, idx) => (
              <div key={`${moment.transcript_snippet}-${idx}`} className="border-l-2 border-accent/45 pl-4">
                <p className="mb-2 text-sm text-text-muted">You said:</p>
                <p className="mb-3 text-[15px] leading-7 text-text">
                  &ldquo;{moment.transcript_snippet}&rdquo;
                </p>
                <p className="mb-2 text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">Why this weakened the answer: </span>
                  {moment.why_this_weakened}
                </p>
                <p className="text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">How to strengthen it: </span>
                  {moment.how_to_strengthen}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {feedback.quick_wins.length > 0 && (
        <div>
          <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Quick wins
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {feedback.quick_wins.map((win) => (
              <li key={win} className="text-sm leading-6 text-text-muted">
                {win}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
