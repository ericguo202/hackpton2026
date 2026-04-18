/**
 * Editorial bottom strip — the five evaluator dimensions as a "table of
 * contents" for the practice session. Used on Hero and Home.
 *
 * Five is a fact, not a feature: see backend Gemini evaluator schema in
 * ../../../CLAUDE.md (directness, STAR, specificity, impact, conciseness).
 * If that schema changes, this list must move with it.
 */

const DIMENSIONS = [
  { n: '01', name: 'Directness' },
  { n: '02', name: 'STAR' },
  { n: '03', name: 'Specificity' },
  { n: '04', name: 'Impact' },
  { n: '05', name: 'Conciseness' },
] as const;

type Props = { tagline?: string };

export default function ScoreDimensions({ tagline }: Props) {
  return (
    <footer className="border-t border-border px-8 md:px-16 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        {DIMENSIONS.map((d) => (
          <div key={d.n} className="flex items-baseline gap-2">
            <dt className="tabular-nums text-text">{d.n}</dt>
            <dd>{d.name}</dd>
          </div>
        ))}
      </dl>
      {tagline && (
        <p className="font-display italic text-[15px] text-text-muted">
          {tagline}
        </p>
      )}
    </footer>
  );
}
