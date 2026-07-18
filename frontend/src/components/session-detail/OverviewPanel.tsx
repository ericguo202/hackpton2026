/**
 * Overview tab content for SessionDetail.
 *
 * Left column: case-file identity — company name, target role, the
 * full Company Brief (description + headlines + role_signals +
 * sample_question_themes), all inside an inset surface-raised card so it
 * reads as a paper insert inside the dark-beige folder.
 *
 * Right column: per-dimension session averages as six colored tiles,
 * sharing chart-1..6 hues with the History trend chart.
 *
 * Below 900px the two columns stack.
 */

import type { ReactNode } from 'react';

import { scoreDimensionsFor, type ScoreKey } from '../../lib/scoreDimensions';
import type { DimensionAverages, SessionDetail } from '../../types/history';
import FillerRateBar from './FillerRateBar';
import { num } from './_helpers';

type Props = {
  session: SessionDetail;
  /** False while the session is still finalizing — averages are null and a
   *  pending caption explains why, rather than reading as a scoreless session. */
  sessionCompleted: boolean;
};

export default function OverviewPanel({ session, sessionCompleted }: Props) {
  return (
    <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-6 min-[900px]:gap-8 p-6 min-[900px]:p-8">
      <CaseFileColumn session={session} />
      <ScoresOverviewColumn
        // A session is single-category, so label the aggregate tiles from any
        // turn's category (the opening turn). Falls back to STAR for legacy rows.
        category={session.turns[0]?.question_category}
        averages={session.averages}
        fillerRate={num(session.filler_word_rate)}
        caption={
          sessionCompleted
            ? undefined
            : 'Scoring is still in progress. Scores will fill in here as feedback finishes.'
        }
      />
    </div>
  );
}

function CaseFileColumn({ session }: { session: SessionDetail }) {
  const summary = session.summary;
  const headlines = summary?.headlines ?? [];
  const roleSignals = summary?.role_signals ?? [];
  const themes = summary?.sample_question_themes ?? [];

  return (
    <section className="flex flex-col">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-3">
        Company brief
      </p>
      <h2 className="text-2xl font-medium leading-tight text-text mb-1">
        {session.company}
      </h2>
      <p className="text-sm text-text-muted mb-5">
        Target role · {session.job_title}
      </p>

      <div className="flex-1 rounded-lg bg-surface-sunken p-6">
        {summary ? (
          <>
            <p className="text-base leading-7 text-text">
              {summary.description}
            </p>
            {(headlines.length > 0 || roleSignals.length > 0 || themes.length > 0) && (
              <ul className="mt-4 space-y-2">
                {headlines.map((h, i) => (
                  <li key={`h-${i}`} className="text-sm text-text-muted leading-6">
                    — {h}
                  </li>
                ))}
                {roleSignals.length > 0 && (
                  <li className="text-sm text-text-muted leading-6">
                    — <span className="text-text font-medium">What they value:</span>{' '}
                    {roleSignals.join(', ')}
                  </li>
                )}
                {themes.length > 0 && (
                  <li className="text-sm text-text-muted leading-6">
                    — <span className="text-text font-medium">Common themes:</span>{' '}
                    {themes.join(', ')}
                  </li>
                )}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-text-muted">
            No company brief was captured for this session.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Right-column scores grid. Exported so Practice's Results phase can reuse
 * the same color-mapped tile language. `caption` is an optional slot
 * rendered between the eyebrow and the tile grid — used by Practice to
 * surface a session-overall line; SessionDetail omits it.
 */
export function ScoresOverviewColumn({
  averages,
  caption,
  fillerRate,
  category,
}: {
  averages: DimensionAverages;
  caption?: ReactNode;
  /**
   * Session-level filler rate (percent). Rendered as a distinct, full-width
   * traffic-light bar BELOW the six score tiles — a different kind of metric
   * (lower is better), so deliberately not a 7th tile. Omitted when null.
   */
  fillerRate?: number | null;
  /**
   * The session's question category (single-category per session). Resolves the
   * per-position tile labels (STAR vs Motivation & Fit). Omitted/unknown → STAR.
   */
  category?: string | null;
}) {
  return (
    <section className="flex flex-col">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-3">
        Scores overview · session averages
      </p>
      {caption != null && (
        <p className="mb-4 text-sm text-text-muted">{caption}</p>
      )}

      <div className="grid grid-cols-2 min-[900px]:grid-cols-3 gap-3">
        {scoreDimensionsFor(category).map((d) => (
          <ScoreTile
            key={d.key}
            scoreKey={d.key}
            label={d.label}
            color={d.color}
            value={num(averages[d.key])}
          />
        ))}
      </div>

      {fillerRate != null && (
        <div className="mt-3 rounded-lg bg-surface-sunken p-4">
          <FillerRateBar rate={fillerRate} variant="block" />
        </div>
      )}
    </section>
  );
}

function ScoreTile({
  scoreKey,
  label,
  color,
  value,
}: {
  scoreKey: ScoreKey;
  label: string;
  color: string;
  value: number | null;
}) {
  const isDelivery = scoreKey === 'delivery';
  return (
    <div className="rounded-lg bg-surface-sunken p-4 flex flex-col gap-3">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
        {label}
      </p>
      <p className="text-4xl font-medium leading-none tabular-nums text-text">
        {value == null ? '—' : value.toFixed(1)}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${((value ?? 0) / 10) * 100}%`,
            background: color,
          }}
        />
      </div>
      {isDelivery && value == null && (
        <p className="text-xs text-text-subtle">no camera</p>
      )}
    </div>
  );
}
