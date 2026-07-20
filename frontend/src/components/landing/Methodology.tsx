/**
 * Landing section: the methodology case ("What gets measured"). The
 * credibility story for skeptical students and, later, career-center
 * advisors: every claim here states a real product mechanism, no invented
 * stats or testimonials (brief §8).
 *
 * Full-bleed raised band varies the page rhythm: vanilla → white → vanilla.
 *
 * The old right-hand list of six named dimensions is gone: with four question
 * categories there is no longer ONE set of five content dimensions to name
 * here (only Structure and Delivery are shared). The per-category rubrics now
 * live on `/scoring`, which the footer links to on this page too.
 */

const FACTS = [
  {
    lead: 'Graded for your field and level.',
    body: 'Questions and scoring criteria adjust across 15 industry groups and six experience levels. A consulting intern and a senior engineer are graded on different evidence.',
  },
  {
    lead: 'Feedback quotes you.',
    body: 'Every piece of praise or critique is anchored to an exact phrase from your transcript, which you can refer back to.',
  },
  {
    lead: 'Rubrics vary across question type.',
    body: 'Sessions draw on four question categories — Experience (STAR), Motivation & Fit, Situational, and Self-Assessment & Growth — each scored on its own rubric, derived from the guidance university career centers give their students. History shows your strengths and weaknesses both across the four categories and on the individual dimensions within each one.',
  },
  {
    lead: 'Webcam analysis stays in your browser.',
    body: 'Delivery is scored from on-device analysis; raw frames never leave your machine.',
  },
] as const;

export default function Methodology() {
  return (
    <section
      aria-labelledby="methodology-heading"
      className="border-y border-border bg-surface-raised"
    >
      <div className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-8 md:px-16 py-20 md:py-28">
        <h2 id="methodology-heading" className="mb-10 md:mb-14" style={{ textWrap: 'balance' }}>
          What gets measured, and why you can trust it
        </h2>

        {/* Two facts per row on desktop, one per row on mobile. The per-fact
            `max-w-[60ch]` line-length cap stays on the item, not the column, so
            it holds at every width without the grid stretching the measure. */}
        <dl className="grid gap-x-20 gap-y-12 min-[900px]:grid-cols-2">
          {FACTS.map((f) => (
            <div key={f.lead} className="max-w-[60ch]">
              <dt className="font-display text-lg font-semibold text-text">{f.lead}</dt>
              <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-text-muted">
                {f.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
