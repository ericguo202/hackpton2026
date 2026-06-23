/**
 * Client-side prompt-injection check for user-authored free text (bio, pasted
 * résumé, pasted job description — all LONG free-text fields). Gives instant
 * feedback before submit so the user can fix the field; the backend re-checks
 * authoritatively (it's the only place PDF-extracted résumé text exists).
 *
 * This is a hand-maintained MIRROR of the STRICT-LONG gate in
 * `backend/app/services/_injection.py` (`STRICT_INJECTION_RE` =
 * `contains_injection(..., strict=True)`). Same manual-sync discipline as
 * `src/types/`: when one side changes, change the other.
 *
 * "Strict" (vs. the backend's relaxed interview-turn/chatbot gate) adds a
 * target-noun-free override matcher (so a typo'd "ignore all prior
 * instrucdtions" still trips) and "send/write API key" exfil. It still omits
 * false-positive-prone markers (bare "DAN", "act as <role>", bare "system
 * prompt", "jailbreak", bare "API key") that are legitimate in résumé/JD prose;
 * those are left to the backend delimiter/clause layer. Short structured fields
 * (company / role / industry) get an even stricter gate server-side and are not
 * mirrored here (they aren't client-gated).
 */

const PATTERNS = [
  // Instruction-override (relaxed form): verb → previous/prior/all qualifier →
  // instruction target.
  "\\b(?:ignore|disregard|forget|override|bypass)\\b" +
    "(?:\\s+\\w+){0,4}?\\s+" +
    "\\b(?:previous|prior|earlier|preceding|aforementioned|above|all)\\b" +
    "(?:\\s+\\w+){0,2}?\\s+" +
    "\\b(?:instructions?|prompts?|directives?|rules?|messages?|context|commands?)\\b",
  // Instruction-override (STRICT, target-noun-free): imperative verb → temporal
  // qualifier, no trailing noun required — catches typo'd/absent targets
  // ("ignore all prior instrucdtions", "disregard previous"). Anchors on the
  // temporal word (not "all"), and only imperative present-tense verbs, so
  // "ignore all warnings" / "bypassed all prior limits" are left alone.
  "\\b(?:ignore|disregard|forget|override|bypass)\\b" +
    "(?:\\s+\\w+){0,3}?\\s+" +
    "\\b(?:previous|prior|earlier|preceding|aforementioned|above)\\b",
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
  // API-credential exfiltration (long-field form): "send/write … API key".
  // Bare "API key" / "write API documentation" are legit prose here, so a
  // trailing "key" after the verb is required.
  "\\b(?:send|write)\\s+(?:me\\s+)?(?:the\\s+|your\\s+|an?\\s+)?api\\s+key\\b",
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
