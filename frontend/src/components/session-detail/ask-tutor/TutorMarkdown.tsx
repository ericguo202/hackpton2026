/**
 * TutorMarkdown — renders the tight markdown subset the Ask Tutor model is
 * allowed to emit: **bold**, *italic* / _italic_, hyphen bullets, and numbered
 * lists. Nothing else (no headings, tables, code, block quotes, images).
 *
 * Links are OPT-IN via `allowLinks`, and only the general coach (/tutor) passes
 * it. That surface researches the live web and is required to cite its sources,
 * so `[text](url)` and bare `https://` URLs become anchors there; the
 * turn-scoped chat has no web access and keeps its stricter no-link guarantee.
 *
 * Deliberately NOT a markdown library: the subset is tiny and this stays XSS-safe
 * by construction — it only ever emits <p>/<strong>/<em>/<ul>/<ol>/<li>/<a> with
 * React-escaped text and no dangerouslySetInnerHTML, which matters because the
 * reply can echo untrusted transcript text and third-party search results. Every
 * href additionally passes `lib/safeHref`: https-only, so a `javascript:` /
 * `data:` / protocol-relative URL renders as literal text rather than becoming a
 * clickable anchor. That check is the second line of defense behind the prompt's
 * reputable-domain rule — the model chooses WHICH links to give, this decides
 * whether a link is allowed to be a link at all.
 *
 * Tolerant of partial input so it renders cleanly while streaming token-by-token:
 * an unclosed `**`/`*`/`[` mid-stream falls back to its literal characters and
 * resolves on the next token instead of flashing broken markup.
 */

import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { safeHref } from '../../../lib/safeHref';

const BULLET_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^\d+\.\s+(.*)$/;
// A bare URL run in prose. Stops at whitespace, and trims trailing punctuation
// below so "see https://example.com." doesn't swallow the sentence's period.
const BARE_URL_RE = /^https:\/\/[^\s<>()[\]]+/;
const TRAILING_PUNCT_RE = /[.,;:!?'"]+$/;

function anchor(href: string, label: ReactNode, key: number): ReactNode {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-link underline decoration-link/40 underline-offset-2 transition-colors hover:decoration-link"
    >
      {label}
    </a>
  );
}

/** Parse inline `**bold**` / `*italic*` / `_italic_` (and, when `allowLinks`,
 *  `[text](url)` plus bare https URLs); `**` is matched before `*`.
 *  Unmatched markers stay literal (streaming-safe). */
function renderInline(text: string, allowLinks = false): ReactNode[] {
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
    if (allowLinks) {
      // [label](href) — only when the whole construct has closed, so a
      // half-streamed "[Reddit](htt" stays literal until the next token.
      if (text[i] === '[') {
        const close = text.indexOf('](', i);
        const end = close === -1 ? -1 : text.indexOf(')', close + 2);
        if (close > i && end > close) {
          const href = safeHref(text.slice(close + 2, end));
          if (href) {
            flush();
            const label = text.slice(i + 1, close);
            out.push(anchor(href, renderInline(label, allowLinks), key++));
            i = end + 1;
            continue;
          }
        }
      }
      // A bare URL the model dropped in without markdown syntax.
      if (text.startsWith('https://', i)) {
        const match = text.slice(i).match(BARE_URL_RE);
        if (match) {
          const raw = match[0].replace(TRAILING_PUNCT_RE, '');
          const href = safeHref(raw);
          if (href) {
            flush();
            out.push(anchor(href, raw, key++));
            i += raw.length;
            continue;
          }
        }
      }
    }
    // **bold** (or __bold__) — greedy to the matching closer on the same line.
    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const marker = text.slice(i, i + 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 1) {
        flush();
        out.push(
          <strong key={key++} className="font-semibold">
            {renderInline(text.slice(i + 2, end), allowLinks)}
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
            {renderInline(text.slice(i + 1, end), allowLinks)}
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

export function TutorMarkdown({
  text,
  allowLinks = false,
}: {
  text: string;
  /** Render `[text](url)` and bare https URLs as anchors. General coach only. */
  allowLinks?: boolean;
}) {
  const blocks = toBlocks(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.kind === 'ul') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, allowLinks)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'ol') {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, allowLinks)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line, allowLinks)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
