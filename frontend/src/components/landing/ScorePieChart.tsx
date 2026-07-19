/**
 * Hero brand visual: "Explore the four." The pie that names the kinds of
 * question a session asks, turned from a static rainbow into an interactive
 * legend. (It used to enumerate the six SCORE dimensions; those now live on the
 * `/scoring` transparency page, per-category, where they're labelled correctly
 * for each question type.)
 *
 * At rest it is an outlined pie — an amber scallop crust over four unfilled
 * wedges with the category names in the page text color. Hovering, tapping, or
 * keyboard-focusing a wedge fills THAT ONE wedge amber, lifts it outward along
 * its bisector, and swaps the caption below to that category's plain-language
 * definition. Only ever one hue is on screen at a time, which is the point: it
 * answers "too colorful" while staying honestly a pie (the slogan's echo).
 *
 * The wedge carries the SHORT label (it has to fit the rotated radial run); the
 * caption below shows the full `name`. Wedge count is data-driven off
 * DIMENSIONS via `SEG` — the crust's 12 scallops still land a valley on every
 * cut line and a peak on every wedge center at both 6 and 4 wedges.
 *
 * Doctrine (DESIGN.md): strict two-color — amber identity, warm neutrals, zero
 * cherry (cherry is reserved for the page's one CTA). The active wedge wears
 * amber with DARK INK on top (the Amber-Is-Garnish rule), never white. The
 * outlined rest state keeps dark mode trivial: no bright fill blob on espresso,
 * since fills are transparent and strokes/labels ride theme-swapped tokens.
 *
 * Accessibility: each wedge is a focusable control whose accessible name is the
 * dimension plus its definition, so screen-reader users get the same content on
 * focus that sighted users get in the caption (the caption is therefore
 * aria-hidden to avoid double-speak). Roving tabindex + arrow/Home/End keys move
 * between wedges; a transparent fill gives each wedge a full hover/hit area.
 *
 * The crust is the brand mark's scallop: 12 equal outward arcs (the favicon's
 * arc/vertex proportion, ~0.359), phased so a peak centers on each wedge and a
 * valley falls on each cut line. Geometry is static, computed once at load.
 */

import { useRef, useState, type KeyboardEvent } from 'react';

const DIMENSIONS = [
  {
    name: 'Experience (STAR)',
    short: 'Experience',
    definition: 'Tell me about a time you… — what you actually did, and what came of it.',
  },
  {
    name: 'Motivation & Fit',
    short: 'Motivation',
    definition: 'Why this role, why this company, and how your story adds up.',
  },
  {
    name: 'Situational',
    short: 'Situational',
    definition: 'What would you do if… — judgment when the answer is not obvious.',
  },
  {
    name: 'Self-Assessment & Growth',
    short: 'Self-Assess',
    definition: 'Strengths, weaknesses, and what you have done to improve.',
  },
] as const;

/** Degrees per wedge — derived, so the geometry follows DIMENSIONS' length. */
const SEG = 360 / DIMENSIONS.length;

const R_FILL = 84; // filling radius (the pie itself)
const R_VALLEY = 88.5; // scallop valleys; the thin amber band sits between fill and valley
const R_LABEL = 46; // radius the label is centered on, along the slice bisector
const N_SCALLOPS = 12;
const LIFT = 5; // outward nudge (user units) applied to the active wedge
const CRUST_ARC = +(R_VALLEY * (50 / 139.37)).toFixed(2); // favicon crust proportion

// 0° at top, sweeping clockwise.
function point(angleFromTop: number, r: number): [number, number] {
  const rad = ((angleFromTop - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

const SLICES = DIMENSIONS.map((d, i) => {
  const [x0, y0] = point(i * SEG, R_FILL);
  const [x1, y1] = point((i + 1) * SEG, R_FILL);
  const path = `M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R_FILL} ${R_FILL} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;

  // Label on the slice bisector, rotated to the radial axis. Flip the lower
  // half (|rot| > 90) by 180° so every label stays upright.
  const mid = i * SEG + SEG / 2;
  const [lx, ly] = point(mid, R_LABEL);
  let rot = ((mid - 90 + 180) % 360) - 180; // normalize to (-180, 180]
  if (rot > 90) rot -= 180;
  if (rot < -90) rot += 180;

  // Outward unit vector along the bisector, scaled by LIFT, for the active nudge.
  const rad = ((mid - 90) * Math.PI) / 180;
  const dx = +(LIFT * Math.cos(rad)).toFixed(2);
  const dy = +(LIFT * Math.sin(rad)).toFixed(2);

  return { ...d, path, lx, ly, rot, dx, dy };
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [rovingIdx, setRovingIdx] = useState(0); // which wedge owns the tab stop
  const groupRef = useRef<HTMLDivElement>(null);
  const wedgeRefs = useRef<(SVGGElement | null)[]>([]);

  // Keyboard focus wins over hover, so a focused wedge stays revealed even if
  // the pointer drifts to another.
  const active = focusIdx ?? hoverIdx;

  function focusWedge(i: number) {
    setRovingIdx(i);
    wedgeRefs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<SVGGElement>, i: number) {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % SLICES.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i + SLICES.length - 1) % SLICES.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = SLICES.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    focusWedge(next);
  }

  const activeDim = active === null ? null : DIMENSIONS[active];

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label="The four kinds of question a session asks"
      className={`mx-auto w-full max-w-[26rem] ${className}`}
    >
      <svg viewBox="0 0 200 200" className="block w-full overflow-visible">
        {/* Wavy amber crust outline behind the wedges (line-drawing at rest). */}
        <path
          d={CRUST_PATH}
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          style={{ stroke: 'var(--color-amber-deep)' }}
        />

        {SLICES.map((s, i) => {
          const isActive = active === i;
          return (
            <g
              key={s.name}
              ref={(el) => {
                wedgeRefs.current[i] = el;
              }}
              role="button"
              tabIndex={rovingIdx === i ? 0 : -1}
              aria-label={`${s.name}. ${s.definition}`}
              className="pie-slice"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((p) => (p === i ? null : p))}
              onFocus={() => {
                setFocusIdx(i);
                setRovingIdx(i);
              }}
              onBlur={(e) => {
                // Keep the reveal if focus is moving to a sibling wedge (its own
                // onFocus will take over); only clear when leaving the group.
                if (!groupRef.current?.contains(e.relatedTarget as Node | null)) {
                  setFocusIdx(null);
                }
              }}
              onClick={() => focusWedge(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={{ transform: isActive ? `translate(${s.dx}px, ${s.dy}px)` : undefined }}
            >
              <path
                d={s.path}
                strokeWidth={isActive ? 0 : 1.25}
                strokeLinejoin="round"
                style={{
                  // Transparent (not "none") keeps the whole wedge hoverable.
                  fill: isActive ? 'var(--color-amber)' : 'transparent',
                  // Rest outline is the soft red-pink of the CTA's chevron chip
                  // (cherry + 15% white, i.e. accent-fg/15 over cherry): a brand
                  // red that reads as warm rather than "too red", and holds on
                  // both the cream and espresso surfaces without a theme swap.
                  stroke: isActive
                    ? 'transparent'
                    : 'color-mix(in srgb, var(--color-cherry) 85%, #ffffff)',
                }}
              />
              <text
                x={s.lx.toFixed(2)}
                y={s.ly.toFixed(2)}
                transform={`rotate(${s.rot.toFixed(2)} ${s.lx.toFixed(2)} ${s.ly.toFixed(2)})`}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="7"
                className="font-display"
                style={{
                  // Dark ink on the amber fill (Amber-Is-Garnish); page text
                  // color on the unfilled rest state. Both hold in either theme.
                  fill: isActive ? 'var(--color-primary-700)' : 'var(--color-text)',
                  fontWeight: isActive ? 700 : 600,
                  letterSpacing: '0.01em',
                  pointerEvents: 'none',
                }}
              >
                {s.short}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Caption. aria-hidden because each wedge's accessible name already
          carries the definition; this is the sighted-user mirror. Fixed min
          height so swapping text never shifts the hero layout. */}
      <div aria-hidden="true" className="mt-5 min-h-[4.75rem] text-center">
        <div key={active ?? 'rest'} className="anim-crossfade">
          {activeDim === null ? (
            <p className="text-pretty text-sm leading-relaxed text-text-subtle">
              Hover a slice to see what each kind of question asks.
            </p>
          ) : (
            <>
              <p className="font-display text-base font-semibold text-text">{activeDim.name}</p>
              <p className="text-pretty mt-1 text-sm leading-relaxed text-text-muted">
                {activeDim.definition}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
