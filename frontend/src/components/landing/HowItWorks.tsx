/**
 * Landing section: the two-turn session as a true ordered sequence, paired
 * with a real sample of what the session produces. Left column is the feedback
 * specimen (the output); right column is the three steps that lead to it. The
 * numbered markers are earned here because a session is genuinely 1 → 2 → 3.
 */

import FeedbackSpecimen from './FeedbackSpecimen';

const STEPS = [
  {
    title: 'Speak your answer',
    body: 'Pick the company and role you’re interviewing for. InterviewPie researches both, asks one behavioral question tailored to your résumé and field, and you answer out loud, on camera if you choose.',
  },
  {
    title: 'Handle the follow-up',
    body: 'A second question digs into what you actually said, spoken aloud by the interviewer voice you picked. No script to read from, same as the real thing.',
  },
  {
    title: 'See what to fix',
    body: 'Six scores, feedback anchored to your own transcript, and one concrete focus for your next take.',
  },
] as const;

export default function HowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-8 md:px-16 py-20 md:py-28"
    >
      <h2 id="how-it-works-heading" className="mb-10 md:mb-14" style={{ textWrap: 'balance' }}>
        How a session works
      </h2>

      <div className="grid items-start gap-12 min-[900px]:grid-cols-2 min-[900px]:gap-16">
        <FeedbackSpecimen className="order-last min-[900px]:order-first" />

        <ol className="flex flex-col gap-8 order-first min-[900px]:order-last">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 max-w-[48ch]">
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-tint font-display text-base font-semibold text-primary-700 dark:bg-amber/10 dark:text-amber"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="mb-1.5">{step.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
