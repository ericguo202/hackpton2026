/**
 * Score rail: display value, 2-px progress bar, eyebrow label. Used for
 * both per-turn coach cards (integer values) and session summary (averaged,
 * decimal values). `value` is 0-10; pass the display string separately so
 * the caller controls rounding/placeholders.
 */

type ScoreEntry = {
  key: string;
  label: string;
  /** 0-10 numeric value used to compute the bar width. Null renders an empty bar. */
  value: number | null;
  /** Pre-formatted display (e.g. "7" or "7.3" or "—"). */
  display: string;
};

type Props = {
  entries: ScoreEntry[];
};

export function ScoreGrid({ entries }: Props) {
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-7 sm:grid-cols-6">
      {entries.map(({ key, label, value, display }) => (
        <div key={key}>
          <div className="font-display text-[2.25rem] font-medium leading-none tabular-nums text-text">
            {display}
          </div>
          <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-accent"
              style={{ width: `${((value ?? 0) / 10) * 100}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-eyebrow text-text-muted">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
