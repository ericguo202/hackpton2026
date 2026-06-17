/**
 * TutorMarkdown — renders the tight markdown subset the Ask Tutor model is
 * allowed to emit: **bold**, *italic* / _italic_, hyphen bullets, and numbered
 * lists. Nothing else (no headings, tables, code, block quotes, links, images).
 *
 * Deliberately NOT a markdown library: the subset is tiny and this stays XSS-safe
 * by construction — it only ever emits <p>/<strong>/<em>/<ul>/<ol>/<li> with
 * React-escaped text (no dangerouslySetInnerHTML, no link/href path), which
 * matters because the reply can echo untrusted transcript text.
 *
 * Tolerant of partial input so it renders cleanly while streaming token-by-token:
 * an unclosed `**`/`*` mid-stream falls back to its literal characters and
 * resolves on the next token instead of flashing broken markup.
 */

import { Fragment } from 'react';
import type { ReactNode } from 'react';

const BULLET_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^\d+\.\s+(.*)$/;

/** Parse inline `**bold**` / `*italic*` / `_italic_`; `**` is matched before `*`.
 *  Unmatched markers stay literal (streaming-safe). */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let key = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = '';
    }
  };

  for (let i = 0; i < text.length; ) {
    // **bold** (or __bold__) — greedy to the matching closer on the same line.
    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const marker = text.slice(i, i + 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 1) {
        flush();
        out.push(
          <strong key={key++} className="font-semibold">
            {renderInline(text.slice(i + 2, end))}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    // *italic* / _italic_ — single-char markers, must wrap non-empty content.
    const ch = text[i];
    if (ch === '*' || ch === '_') {
      const end = text.indexOf(ch, i + 1);
      if (end > i + 1) {
        flush();
        out.push(
          <em key={key++} className="italic">
            {renderInline(text.slice(i + 1, end))}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

/** Group lines into paragraph / unordered-list / ordered-list blocks. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    const bullet = line.match(BULLET_RE);
    const ordered = line.match(ORDERED_RE);
    const last = blocks[blocks.length - 1];

    if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
    } else if (ordered) {
      if (last?.kind === 'ol') last.items.push(ordered[1]);
      else blocks.push({ kind: 'ol', items: [ordered[1]] });
    } else if (line.trim() === '') {
      // Blank line breaks the current paragraph/list.
      if (last?.kind === 'p') blocks.push({ kind: 'p', lines: [] });
    } else if (last?.kind === 'p' && last.lines.length > 0) {
      last.lines.push(line);
    } else {
      blocks.push({ kind: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => (b.kind === 'p' ? b.lines.length > 0 : b.items.length > 0));
}

export function TutorMarkdown({ text }: { text: string }) {
  const blocks = toBlocks(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.kind === 'ul') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'ol') {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
