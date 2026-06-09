/**
 * Client-side prompt-injection check for user-authored free text (bio, pasted
 * résumé). Gives instant feedback before submit so the user can fix the field;
 * the backend re-checks authoritatively (it's the only place PDF-extracted
 * résumé text exists).
 *
 * This is a hand-maintained MIRROR of `backend/app/services/_injection.py`
 * (`CONTENT_INJECTION_RE`). Same manual-sync discipline as `src/types/`: when one
 * side changes, change the other. Precision-tuned — deliberately omits
 * false-positive-prone markers (bare "DAN", "system update", "act as <role>",
 * "no restrictions", bare "system prompt", "jailbreak"); those are left to the
 * backend delimiter/clause layer.
 */

const PATTERNS = [
  // Instruction-override: verb → previous/prior/all qualifier → instruction target.
  "\\b(?:ignore|disregard|forget|override|bypass)\\b" +
    "(?:\\s+\\w+){0,4}?\\s+" +
    "\\b(?:previous|prior|earlier|preceding|aforementioned|above|all)\\b" +
    "(?:\\s+\\w+){0,2}?\\s+" +
    "\\b(?:instructions?|prompts?|directives?|rules?|messages?|context|commands?)\\b",
  // Role reassignment / model impersonation (AI-targeted only).
  "\\byou\\s+are\\s+now\\b",
  "\\b(?:act\\s+as|pretend\\s+(?:to\\s+be|you(?:'re|\\s+are)))\\s+(?:an?\\s+)?" +
    "(?:ai|a\\.i\\.|assistant|language\\s+model|chat\\s?bot|chatgpt|llm)\\b",
  // System / developer channel spoofing. "system prompt" only when an
  // exfiltration/override verb targets it (bare "system prompt" is legit tech talk).
  "\\b(?:reveal|leak|print|repeat|show|expose|dump|disclose|output|disregard|ignore|override|bypass)\\b" +
    "(?:\\s+\\w+){0,3}?\\s+(?:the\\s+|your\\s+|its\\s+|my\\s+)?system\\s+prompt\\b",
  "\\bdeveloper\\s+(?:message|mode)\\b",
  "\\bdo\\s+anything\\s+now\\b",
  // Fake task / instruction handoff.
  "\\b(?:here(?:'s| is)|this is)\\s+your\\s+(?:next|new)\\s+(?:task|instruction|prompt)\\b",
  "\\byour\\s+(?:new|next|real|actual)\\s+(?:task|instruction|job|goal)\\s+is\\b",
  "\\bnew\\s+instructions?\\s*:",
  // Authority / context manipulation.
  "\\bprevious\\s+(?:user|conversation|session|prompt)\\s+was\\s+(?:a\\s+)?test\\b",
];

export const CONTENT_INJECTION_RE = new RegExp(PATTERNS.join("|"), "i");

export const CONTENT_POLICY_MESSAGE =
  "This content violates our usage policies. Please revise it.";

/** True if `text` trips the content-injection regex. Empty is never a violation. */
export function violatesContentPolicy(text: string): boolean {
  return CONTENT_INJECTION_RE.test(text);
}
