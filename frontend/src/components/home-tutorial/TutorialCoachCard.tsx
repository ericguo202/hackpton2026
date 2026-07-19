/**
 * A single coach-mark card for the Home tutorial: a rounded panel with a
 * pointer (a rotated square sharing the card's surface + border) aimed at the
 * highlighted target, the step copy, a "N of M" counter, and Back/Next/Done
 * controls plus a quiet "Skip tour" exit. Positioning is owned by the parent
 * (`HomeTutorial`); this component only draws the card + pointer.
 */

import { type ReactNode } from 'react';

import { Button } from '../ui/button';

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Render a step body, turning inline `[text](href)` markdown into links. Opened
 * in a new tab on purpose: the tour lives in a portal over Home, so navigating
 * in-place would unmount it mid-walkthrough. Bodies with no link render as
 * plain text (every pre-existing step).
 */
function renderBody(body: string): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(body)) !== null) {
    const [full, text, href] = match;
    if (match.index > cursor) parts.push(body.slice(cursor, match.index));
    parts.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="rounded-xs text-link underline underline-offset-2 transition-colors hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
      >
        {text}
      </a>,
    );
    cursor = match.index + full.length;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));

  return parts.length > 0 ? parts : body;
}

type Props = {
  body: string;
  stepIndex: number;
  total: number;
  /** Where the card sits relative to the target (drives the pointer edge). */
  placement: 'top' | 'bottom';
  /** Horizontal px offset of the pointer from the card's left edge; <0 hides it. */
  pointerLeft: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
};

export default function TutorialCoachCard({
  body,
  stepIndex,
  total,
  placement,
  pointerLeft,
  onBack,
  onNext,
  onSkip,
}: Props) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;

  // Card-below-target → pointer on the top edge (top+left borders showing);
  // card-above-target → pointer on the bottom edge (bottom+right borders).
  const pointerClass =
    placement === 'bottom'
      ? '-top-[7px] border-l border-t'
      : '-bottom-[7px] border-b border-r';

  return (
    <div className="relative w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface-raised p-5 shadow-2xl">
      {pointerLeft >= 0 && (
        <span
          aria-hidden="true"
          style={{ left: pointerLeft }}
          className={
            'absolute h-3 w-3 -translate-x-1/2 rotate-45 border-border bg-surface-raised ' +
            pointerClass
          }
        />
      )}

      <p className="text-sm leading-relaxed text-text">{renderBody(body)}</p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-text-subtle">
          {stepIndex + 1} of {total}
        </span>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button variant="outline" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          <Button size="sm" onClick={onNext}>
            {isLast ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="mt-3 cursor-pointer text-xs text-text-subtle underline-offset-4 transition-colors hover:text-text-muted hover:underline focus-visible:underline focus-visible:outline-none"
      >
        Skip tour
      </button>
    </div>
  );
}
