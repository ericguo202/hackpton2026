/**
 * One question-category block on the Scoring page: header + subtitle, then a
 * half/half grid (desktop) of pie + dimension descriptions on the left and
 * answering tips on the right. Below 900px it collapses to a single column with
 * the pie first (natural DOM order), so mobile reads pie → descriptions → tips.
 *
 * Dimension LABELS + COLORS come from the canonical `scoreDimensionsFor(category)`
 * (the same source History/SessionDetail use) so the pie, the description list,
 * and the rest of the app never drift. The page supplies only the per-dimension
 * blurb text (in canonical position order) + the tips. Delivery (the shared 6th
 * slot) is dropped — it's explained once in the page intro, not per category.
 */

import { useState, type ReactNode } from 'react';

import { scoreDimensionsFor } from '../../lib/scoreDimensions';
import { cn } from '../../lib/utils';
import { questionCategoryLabel } from '../../types/session';
import CategoryScorePie from './CategoryScorePie';

export type CategoryContent = {
  category: string;
  subtitle: ReactNode;
  /** Optional extra explanatory prose under the subtitle (situational uses it). */
  intro?: ReactNode;
  /** Per-dimension blurbs, canonical position order (Structure first), 5 items. */
  dimensionBlurbs: ReactNode[];
  tips: ReactNode[];
};

export default function CategoryScoringSection({
  content,
}: {
  content: CategoryContent;
}) {
  const [active, setActive] = useState<number | null>(null);
  const label = questionCategoryLabel(content.category);
  // Five content dimensions only; drop the shared Delivery slot.
  const dims = scoreDimensionsFor(content.category).filter(
    (d) => d.key !== 'delivery',
  );
  const pieDims = dims.map((d) => ({ label: d.label, color: d.color }));

  return (
    <section aria-labelledby={`scoring-${content.category}`} className="space-y-6">
      <header className="space-y-2">
        <h2
          id={`scoring-${content.category}`}
          className="font-display text-2xl font-medium"
        >
          {label}
        </h2>
        <p className="text-sm italic leading-6 text-text-muted">
          {content.subtitle}
        </p>
        {content.intro && (
          <p className="max-w-3xl text-sm leading-6 text-text-muted">
            {content.intro}
          </p>
        )}
      </header>

      <div className="grid gap-8 min-[900px]:grid-cols-2 min-[900px]:items-start">
        {/* LEFT — pie + dimension descriptions */}
        <div className="space-y-6">
          <CategoryScorePie
            dimensions={pieDims}
            activeIndex={active}
            onActiveChange={setActive}
            ariaLabel={`${label} scoring dimensions`}
            className="max-w-[18rem] min-[900px]:max-w-[15rem] min-[1200px]:max-w-[22rem]"
          />
          <dl className="space-y-1">
            {dims.map((d, i) => (
              <div
                key={d.key}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((p) => (p === i ? null : p))}
                className={cn(
                  'rounded-md px-3 py-2 transition-colors',
                  active === i ? 'bg-surface-sunken' : 'bg-transparent',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: d.color }}
                  />
                  <dt className="font-display text-sm font-semibold text-text">
                    {d.label}
                  </dt>
                </div>
                <dd className="mt-0.5 pl-5 text-sm leading-6 text-text-muted">
                  {content.dimensionBlurbs[i]}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* RIGHT — answering tips */}
        <div className="space-y-3">
          <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Tips
          </p>
          <ul className="space-y-3">
            {content.tips.map((tip, i) => (
              <li
                key={i}
                className="flex gap-3 text-sm leading-6 text-text-muted"
              >
                <span
                  aria-hidden
                  className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-highlight"
                />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
