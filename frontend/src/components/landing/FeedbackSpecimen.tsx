/**
 * Hero specimen: one realistic feedback moment rendered as real UI, used in
 * place of illustration on the signed-out landing page (brief: "the product
 * output is the artwork"). Content is static and clearly labeled as a sample.
 *
 * Anatomy mirrors the in-app feedback order of importance: question →
 * quoted moment → fix → takeaway → scores last (PRODUCT.md: scores exist to
 * justify the takeaway, never to stand alone).
 */

const SCORES = [
  { label: 'Structure', value: 8, dot: 'bg-chart-1' },
  { label: 'Problem solving', value: 7, dot: 'bg-chart-2' },
  { label: 'Impact', value: 5, dot: 'bg-chart-3' },
  { label: 'Initiative', value: 8, dot: 'bg-chart-4' },
  { label: 'Depth', value: 6, dot: 'bg-chart-5' },
  { label: 'Delivery', value: 7, dot: 'bg-chart-6' },
] as const;

export default function FeedbackSpecimen({ className = '' }: { className?: string }) {
  return (
    <figure className={className}>
      <figcaption className="mb-3 text-sm text-text-subtle">
        Sample feedback from a practice session
      </figcaption>

      <div className="rounded-lg border border-border bg-surface-raised p-6 md:p-7">
        <p className="font-display text-base font-semibold leading-snug text-text">
          Tell me about a time you had to deliver under a tight deadline.
        </p>

        <div className="mt-5">
          <span className="inline-block rounded-full border border-transparent bg-amber-tint px-3 py-1 text-xs font-medium text-primary-700 dark:border-amber/40 dark:bg-transparent dark:text-amber">
            Missing result
          </span>
          <blockquote className="mt-3 border-y border-border py-3 text-[0.9375rem] leading-relaxed text-text">
            “…and we basically got it done somehow.”
          </blockquote>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            It closes the story without saying what shipped or what changed.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-text">
            <span className="font-medium">Try instead:</span> end with the
            outcome and one number. What shipped, by when, measured how.
          </p>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-text-muted">
          <span className="font-medium text-text">Main takeaway:</span> strong
          ownership and a clear arc; quantify the result to land the impact.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5">
          {SCORES.map((s) => (
            <div key={s.label}>
              <dt className="flex items-center gap-1.5 whitespace-nowrap text-eyebrow uppercase tracking-eyebrow text-text-subtle">
                <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                {s.label}
              </dt>
              <dd className="mt-1 font-display text-lg font-semibold tabular-nums text-text">
                {s.value}
                <span className="text-xs font-normal text-text-subtle"> / 10</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </figure>
  );
}
