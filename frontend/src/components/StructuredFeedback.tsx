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

  const positiveMoments = feedback.positive_moments ?? [];
  const improvementMoments = feedback.improvement_moments ?? feedback.coaching_moments ?? [];
  const quickWins = feedback.quick_wins ?? [];

  return (
    <div className="space-y-7">
      {positiveMoments.length > 0 && (
        <div>
          <p className="mb-4 text-eyebrow uppercase tracking-eyebrow text-text-muted">
            What worked
          </p>
          <div className="space-y-5">
            {positiveMoments.map((moment, idx) => (
              <div key={`${moment.transcript_snippet}-${idx}`} className="border-l-2 border-chart-3/55 pl-4">
                <p className="mb-2 text-sm text-text-muted">You said:</p>
                <p className="mb-3 text-[15px] leading-7 text-text">
                  &ldquo;{moment.transcript_snippet}&rdquo;
                </p>
                <p className="mb-2 text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">Why this helped: </span>
                  {moment.why_this_helped}
                </p>
                <p className="text-sm leading-6 text-text-muted">
                  <span className="font-medium text-text">Keep doing this: </span>
                  {moment.keep_doing}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Main takeaway
        </p>
        <p className="text-[15px] leading-7 text-text">{feedback.main_takeaway}</p>
      </div>

      {improvementMoments.length > 0 && (
        <div>
          <p className="mb-4 text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Improvement moments
          </p>
          <div className="space-y-5">
            {improvementMoments.map((moment, idx) => (
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

      {quickWins.length > 0 && (
        <div>
          <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Quick wins
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {quickWins.map((win) => (
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
