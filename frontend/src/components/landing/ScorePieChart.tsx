/**
 * Hero brand visual: the six scored dimensions drawn as a literal pie. Each
 * slice is one dimension in its chart color (the same hues used in the
 * Methodology legend and the feedback specimen), ringed by a wavy amber crust,
 * with the dimension name set white along the slice's radial axis. Decorative
 * but honest: it names exactly what a session measures, no separate legend.
 *
 * The crust is the brand mark's scallop: 12 equal outward arcs (the favicon's
 * arc/vertex proportion, ~0.359), phased so a scallop peak centers on each
 * slice and a valley falls on each cut line.
 *
 * Labels: each sits on its slice's bisector (the vertex→border axis), rotated
 * to that axis and flipped on the lower three so all six read right-side-up.
 * White fill plus a thin translucent dark outline (paint-order stroke) keeps
 * them legible over any slice color in either theme; the dark-mode chart hues
 * are light pastels, so white alone would not read.
 *
 * Theme-aware for free: fills reference the --color-chart-* / --color-amber
 * custom properties, which html.dark swaps. Geometry is static, computed once
 * at module load.
 */

const DIMENSIONS = [
  { name: 'Structure', varName: '--color-chart-1' },
  { name: 'Problem solving', varName: '--color-chart-2' },
  { name: 'Impact', varName: '--color-chart-3' },
  { name: 'Initiative', varName: '--color-chart-4' },
  { name: 'Depth', varName: '--color-chart-5' },
  { name: 'Delivery', varName: '--color-chart-6' },
] as const;

const R_FILL = 84; // filling radius (the pie itself)
const R_VALLEY = 88.5; // scallop valleys; the thin amber band sits between fill and valley
const R_LABEL = 46; // radius the label is centered on, along the slice bisector
const N_SCALLOPS = 12;
const CRUST_ARC = +(R_VALLEY * (50 / 139.37)).toFixed(2); // favicon crust proportion

// 0° at top, sweeping clockwise.
function point(angleFromTop: number, r: number): [number, number] {
  const rad = ((angleFromTop - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

const SLICES = DIMENSIONS.map((d, i) => {
  const [x0, y0] = point(i * 60, R_FILL);
  const [x1, y1] = point((i + 1) * 60, R_FILL);
  const path = `M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R_FILL} ${R_FILL} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;

  // Label on the slice bisector, rotated to the radial axis. Flip the lower
  // half (|rot| > 90) by 180° so every label stays upright.
  const mid = i * 60 + 30;
  const [lx, ly] = point(mid, R_LABEL);
  let rot = ((mid - 90 + 180) % 360) - 180; // normalize to (-180, 180]
  if (rot > 90) rot -= 180;
  if (rot < -90) rot += 180;

  return { ...d, path, lx, ly, rot };
});

// Scalloped crust outline: 12 outward arcs between valley vertices.
const CRUST_PATH = (() => {
  const [sx, sy] = point(0, R_VALLEY);
  let d = `M${sx.toFixed(2)} ${sy.toFixed(2)}`;
  for (let k = 1; k <= N_SCALLOPS; k++) {
    const [x, y] = point((k * 360) / N_SCALLOPS, R_VALLEY);
    d += ` A${CRUST_ARC} ${CRUST_ARC} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d} Z`;
})();

export default function ScorePieChart({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label="A pie split into the six dimensions each answer is scored on: structure, problem solving, impact, initiative, depth, and delivery."
      className={`mx-auto block w-full max-w-[26rem] ${className}`}
    >
      {/* Wavy amber crust behind the slices; the scalloped rim shows through. */}
      <path
        d={CRUST_PATH}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ fill: 'var(--color-amber)', stroke: 'var(--color-amber-deep)' }}
      />

      {/* Filling: six dimension slices, separated by surface-colored cut lines. */}
      {SLICES.map((s) => (
        <path
          key={s.name}
          d={s.path}
          strokeWidth="2.5"
          strokeLinejoin="round"
          style={{ fill: `var(${s.varName})`, stroke: 'var(--color-surface)' }}
        />
      ))}

      {/* Tidy the point where the six cuts converge. */}
      <circle cx="100" cy="100" r="2.5" style={{ fill: 'var(--color-surface)' }} />

      {/* Dimension names, white on the slice's radial axis. */}
      {SLICES.map((s) => (
        <text
          key={`${s.name}-label`}
          x={s.lx.toFixed(2)}
          y={s.ly.toFixed(2)}
          transform={`rotate(${s.rot.toFixed(2)} ${s.lx.toFixed(2)} ${s.ly.toFixed(2)})`}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="7"
          className="font-display"
          style={{
            fill: '#FFFFFF',
            fontWeight: 600,
            paintOrder: 'stroke',
            stroke: 'rgba(12, 8, 6, 0.5)',
            strokeWidth: 0.85,
            strokeLinejoin: 'round',
            letterSpacing: '0.01em',
          }}
        >
          {s.name}
        </text>
      ))}
    </svg>
  );
}
