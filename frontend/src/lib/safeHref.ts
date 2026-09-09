/**
 * The href gate for tutor-rendered links.
 *
 * The general Ask Tutor coach researches the live web and is required to cite
 * its sources, so its replies carry URLs — model-authored text derived from
 * third-party pages. The prompt decides WHICH links are worth giving (its
 * reputable-domain rule); this decides whether a string is allowed to become a
 * clickable anchor at all, which is the part that must not depend on the model
 * behaving.
 *
 * https ONLY. That rejects `javascript:`, `data:`, `vbscript:` and `file:`
 * schemes, protocol-relative `//evil.example`, and plain `http:` too — a coach
 * citing a source has no reason to send anyone to an unencrypted page. Anything
 * rejected renders as literal text instead.
 *
 * Its own module (not an export of `TutorMarkdown.tsx`) because
 * `react-refresh/only-export-components` requires component files to export only
 * components — the same reason `joinSpoken.ts` lives apart from its button.
 */

export function safeHref(raw: string): string | null {
  const candidate = raw.trim();
  if (!candidate.toLowerCase().startsWith('https://')) return null;
  try {
    const url = new URL(candidate);
    // Re-check after parsing: `new URL` normalizes, and a hostname is required
    // (`https:///path` parses but points nowhere).
    return url.protocol === 'https:' && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}
