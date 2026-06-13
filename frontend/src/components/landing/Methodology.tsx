/**
 * Landing section: the methodology case ("What gets measured"). The
 * credibility story for skeptical students and, later, career-center
 * advisors: every claim here states a real product mechanism, no invented
 * stats or testimonials (brief §8).
 *
 * Full-bleed raised band varies the page rhythm: vanilla → white → vanilla.
 */

const DIMENSIONS = [
  { name: 'Structure', dot: 'bg-chart-1', desc: 'Does the answer have a beginning, a decision, and an end?' },
  { name: 'Problem solving', dot: 'bg-chart-2', desc: 'Is the reasoning behind your choices visible?' },
  { name: 'Impact', dot: 'bg-chart-3', desc: 'Does it close with a result someone could measure?' },
  { name: 'Initiative', dot: 'bg-chart-4', desc: 'Did you own the move, or watch it happen?' },
  { name: 'Depth', dot: 'bg-chart-5', desc: 'Specifics over generalities.' },
  { name: 'Delivery', dot: 'bg-chart-6', desc: 'Eye contact, posture, and energy from your webcam. Scored only when the camera is on.' },
] as const;

const FACTS = [
  {
    lead: 'Graded for your field and level.',
    body: 'Questions and scoring criteria adjust across 15 industry groups and six experience levels. A consulting intern and a staff engineer are graded on different evidence.',
  },
  {
    lead: 'Feedback quotes you.',
    body: 'Every piece of praise or critique is anchored to an exact phrase from your transcript. If it can’t point to your words, it’s dropped.',
  },
  {
    lead: 'Filler words are counted, not guessed.',
    body: 'Ums, likes, and you-knows are tallied by exact matching and tracked as a rate across sessions, so you can watch it fall.',
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

        <div className="grid gap-14 min-[900px]:grid-cols-2 min-[900px]:gap-20">
          <dl className="flex max-w-[60ch] flex-col gap-8">
            {FACTS.map((f) => (
              <div key={f.lead}>
                <dt className="font-display text-lg font-semibold text-text">{f.lead}</dt>
                <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-text-muted">
                  {f.body}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="self-start divide-y divide-border">
            {DIMENSIONS.map((d) => (
              <li key={d.name} className="flex items-baseline gap-3 py-4 first:pt-0 last:pb-0">
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 translate-y-px rounded-full ${d.dot}`} />
                <div>
                  <span className="font-display text-base font-semibold text-text">{d.name}</span>
                  <p className="mt-0.5 text-sm leading-relaxed text-text-muted">{d.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
