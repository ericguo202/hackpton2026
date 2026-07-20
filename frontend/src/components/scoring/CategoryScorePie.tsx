/**
 * The scoring-page pie: a category's five content dimensions as equal wedges,
 * each filled with its own History chart color (`--color-chart-1..5`) and
 * labelled on the wedge. Adapted from the landing `ScorePieChart` polar geometry
 * but multi-hued (all wedges colored at once, not the single-amber active model)
 * and CONTROLLED — the active wedge is owned by the parent section so the sibling
 * description list highlights in sync (hover/focus either surface drives both).
 *
 * The svg fills its container width, so the parent sizes it responsively (it
 * downsizes in the narrow 900–1200px desktop band; see CategoryScoringSection).
 */

import { useRef, useState, type KeyboardEvent } from 'react';

export type PieDimension = { label: string; color: string };

const R_FILL = 84; // wedge radius
const R_LABEL = 47; // radius the label rides on, along the slice bisector
const LIFT = 6; // outward nudge (user units) on the active wedge

// 0° at top, sweeping clockwise.
function point(angleFromTop: number, r: number): [number, number] {
  const rad = ((angleFromTop - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

// On-wedge labels stay horizontal (not rotated) and wrap onto two lines so long
// names fit inside the wedge instead of overflowing the rim — split on a space
// ("Career Narrative", "Company Insight") or, failing that, a hyphen
// ("Self-Awareness" → "Self-" / "Awareness").
function labelLines(label: string): string[] {
  if (label.includes(' ')) return label.split(' ');
  const hy = label.indexOf('-');
  if (hy > 0 && hy < label.length - 1) {
    return [label.slice(0, hy + 1), label.slice(hy + 1)];
  }
  return [label];
}

type Props = {
  dimensions: readonly PieDimension[];
  activeIndex: number | null;
  onActiveChange: (i: number | null) => void;
  ariaLabel: string;
  className?: string;
};

export default function CategoryScorePie({
  dimensions,
  activeIndex,
  onActiveChange,
  ariaLabel,
  className = '',
}: Props) {
  const n = dimensions.length;
  const seg = 360 / n;
  const groupRef = useRef<HTMLDivElement>(null);
  const wedgeRefs = useRef<(SVGGElement | null)[]>([]);
  const [rovingIdx, setRovingIdx] = useState(0); // which wedge owns the tab stop

  const slices = dimensions.map((d, i) => {
    const [x0, y0] = point(i * seg, R_FILL);
    const [x1, y1] = point((i + 1) * seg, R_FILL);
    const large = seg > 180 ? 1 : 0;
    const path = `M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R_FILL} ${R_FILL} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    const mid = i * seg + seg / 2;
    const [lx, ly] = point(mid, R_LABEL);
    const rad = ((mid - 90) * Math.PI) / 180;
    const dx = +(LIFT * Math.cos(rad)).toFixed(2);
    const dy = +(LIFT * Math.sin(rad)).toFixed(2);
    return { ...d, path, lx, ly, dx, dy, lines: labelLines(d.label) };
  });

  function focusWedge(i: number) {
    setRovingIdx(i);
    wedgeRefs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<SVGGElement>, i: number) {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % n;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i + n - 1) % n;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    focusWedge(next);
  }

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={ariaLabel}
      className={`mx-auto w-full ${className}`}
    >
      <svg viewBox="0 0 200 200" className="block w-full overflow-visible">
        {slices.map((s, i) => {
          const isActive = activeIndex === i;
          const dimmed = activeIndex !== null && !isActive;
          return (
            <g
              key={s.label}
              ref={(el) => {
                wedgeRefs.current[i] = el;
              }}
              role="button"
              tabIndex={rovingIdx === i ? 0 : -1}
              aria-label={s.label}
              onMouseEnter={() => onActiveChange(i)}
              onMouseLeave={() => onActiveChange(null)}
              onFocus={() => {
                onActiveChange(i);
                setRovingIdx(i);
              }}
              onBlur={(e) => {
                // Keep the reveal if focus is moving to a sibling wedge; only
                // clear when focus leaves the pie entirely.
                if (!groupRef.current?.contains(e.relatedTarget as Node | null)) {
                  onActiveChange(null);
                }
              }}
              onClick={() => focusWedge(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={{
                transform: isActive ? `translate(${s.dx}px, ${s.dy}px)` : undefined,
                transition: 'transform 150ms ease',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <path
                d={s.path}
                strokeWidth={1.25}
                strokeLinejoin="round"
                style={{
                  fill: s.color,
                  fillOpacity: dimmed ? 0.55 : 1,
                  stroke: 'var(--color-surface-raised)',
                  transition: 'fill-opacity 150ms ease',
                }}
              />
              <text
                x={s.lx.toFixed(2)}
                y={s.ly.toFixed(2)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="6.6"
                className="font-display"
                style={{
                  // White fill with a thin dark outline (paint-order: stroke)
                  // stays legible on every hue in either theme.
                  fill: '#ffffff',
                  paintOrder: 'stroke',
                  stroke: 'rgba(20, 13, 10, 0.5)',
                  strokeWidth: 1.4,
                  strokeLinejoin: 'round',
                  fontWeight: isActive ? 700 : 600,
                  letterSpacing: '0.01em',
                  pointerEvents: 'none',
                }}
              >
                {s.lines.length === 1 ? (
                  s.lines[0]
                ) : (
                  s.lines.map((ln, k) => (
                    <tspan key={ln} x={s.lx.toFixed(2)} dy={k === 0 ? -3 : 7}>
                      {ln}
                    </tspan>
                  ))
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
