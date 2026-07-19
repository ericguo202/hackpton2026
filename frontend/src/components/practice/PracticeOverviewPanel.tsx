/**
 * Overview tab for Practice's Results phase. Mirrors the two-column shape
 * of SessionDetail's `OverviewPanel` (1-col below 900px, 2-col above) but
 * swaps the left "company brief" column for a Practice-tailored intro:
 *
 *   - "Let's look at how you did" heading.
 *   - Company name + target role.
 *   - Editorial body paragraph framing what the per-turn replays contain.
 *
 * The right column reuses `ScoresOverviewColumn` from session-detail so
 * the per-dimension tile language stays consistent with SessionDetail and
 * History's trend chart. The `caption` slot carries the session-level
 * "Overall X/10 averaged across N of M turns" line — only Practice
 * surfaces this; SessionDetail omits it.
 */

import type { DimensionAverages, TurnDetail } from '../../types/history';
import { ScoresOverviewColumn } from '../session-detail/OverviewPanel';
import { isMixedCategorySession, turnAverage } from '../session-detail/_helpers';

type Props = {
  company: string;
  jobTitle: string;
  averages: DimensionAverages;
  turns: TurnDetail[];
  sessionCompleted: boolean;
};

export function PracticeOverviewPanel({
  company,
  jobTitle,
  averages,
  turns,
  sessionCompleted,
}: Props) {
  const evaluatedAverages = turns
    .map((t) => turnAverageOrNull(t))
    .filter((v): v is number => v !== null);
  const evaluatedCount = evaluatedAverages.length;
  const overall =
    evaluatedCount > 0
      ? (evaluatedAverages.reduce((a, b) => a + b, 0) / evaluatedCount).toFixed(1)
      : null;

  const totalTurns = turns.length;
  const caption =
    overall != null
      ? `Overall ${overall}/10 averaged across ${evaluatedCount} of ${totalTurns} turn${totalTurns === 1 ? '' : 's'}`
      : !sessionCompleted
        ? 'Scoring is still in progress. Scores will fill in here as feedback finishes.'
      : `No turns were scored in this session.`;

  // While the session is still finalizing, the server-side `averages` are null
  // until every turn is scored — so the per-dimension tiles would read as
  // dashes even though earlier turns already have scores (and the caption
  // above already shows a real overall). Derive the tile averages from the
  // turns scored so far instead, then switch to the canonical server averages
  // once completed. Mirrors the old in-Practice Results behavior.
  const effectiveAverages = sessionCompleted ? averages : averagesFromTurns(turns);

  return (
    <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-6 min-[900px]:gap-8 p-6 min-[900px]:p-8">
      <IntroColumn company={company} jobTitle={jobTitle} />
      <ScoresOverviewColumn
        // Label the tiles from the opening turn's category (STAR vs Motivation &
        // Fit). A Recommended Mix session spanning multiple types shows only the
        // type-invariant tiles (Structure + Delivery) — see ScoresOverviewColumn.
        category={turns[0]?.question_category}
        mixed={isMixedCategorySession(turns)}
        averages={effectiveAverages}
        caption={caption}
        fillerRate={sessionFillerRate(turns)}
      />
    </div>
  );
}

const SCORE_DIM_KEYS: ReadonlyArray<keyof DimensionAverages> = [
  'dimension_1',
  'dimension_2',
  'dimension_3',
  'dimension_4',
  'dimension_5',
  'delivery',
];

/**
 * Per-dimension averages over only the turns scored so far — each dimension
 * averages its non-null values, or null when no turn has that score yet.
 * Whitespace-free `.toFixed(2)` strings match the wire-format `DimensionAverages`
 * the tiles expect. Used for the pending state so partial scores still show.
 */
function averagesFromTurns(turns: TurnDetail[]): DimensionAverages {
  const out = {} as DimensionAverages;
  for (const key of SCORE_DIM_KEYS) {
    const vals = turns
      .map((t) => t.scores[key])
      .filter((v): v is number => typeof v === 'number');
    out[key] = vals.length === 0
      ? null
      : (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
  }
  return out;
}

/**
 * Word-weighted session filler rate (percent) from the turns — Σfillers ÷
 * Σwords. Computed here rather than threaded from the refetch so it also
 * works on the refetch-failed fallback path (turns synthesized locally).
 * Whitespace tokenization mirrors the backend's `count_words`.
 */
function sessionFillerRate(turns: TurnDetail[]): number | null {
  let fillers = 0;
  let words = 0;
  for (const t of turns) {
    fillers += t.filler_word_count;
    words += (t.transcript_text ?? '').trim().split(/\s+/).filter(Boolean).length;
  }
  return words > 0 ? (fillers / words) * 100 : null;
}

function IntroColumn({ company, jobTitle }: { company: string; jobTitle: string }) {
  return (
    <section className="flex flex-col">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-3">
        Session complete
      </p>
      <h2
        className="mb-3 font-display font-semibold leading-[1.05] tracking-[-0.02em] text-text"
        style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
      >
        Let&apos;s look at how you did.
      </h2>
      <p className="text-2xl font-medium leading-tight text-text">{company}</p>
      <p className="text-sm text-text-muted mb-6">Target role · {jobTitle}</p>

      <p className="max-w-[54ch] text-sm leading-7 text-text-muted">
        Each replay keeps your actual recording, the model feedback, and the
        delivery analytics together so you can review what to tighten on the
        next run instead of guessing.
        <span className="min-[900px]:hidden"> Swipe left or right to move between turns.</span>
      </p>
    </section>
  );
}

/**
 * Average of a turn's populated score dimensions, or null if the turn
 * produced no usable scores (eval failed or never completed). The
 * shared `turnAverage` returns 0 for that case, which would drag the
 * session-level average down — we want to exclude failed turns instead.
 */
function turnAverageOrNull(t: TurnDetail): number | null {
  const vals = Object.values(t.scores).filter(
    (v): v is number => typeof v === 'number',
  );
  if (vals.length === 0) return null;
  return turnAverage(t);
}
