"""
Shared prompt-injection detection for user-supplied free text.

This is the deterministic, **high-precision** layer of a two-layer defense. It
runs *before* any OpenRouter spend and is safe to hard-block on (it feeds the
submit-turn 422 and the onboarding 422), so it only matches patterns that almost
never appear in genuine interview / résumé prose. The complementary **recall**
layer is the `<candidate_answer>` / `<candidate_profile>` delimiters plus the
untrusted-data system clause in each LLM caller, which catch obfuscation,
scrambled-word exploits, and novel phrasings this regex deliberately won't risk
blocking.

`CONTENT_INJECTION_RE` is the relaxed pattern; it is used ONLY where AI-safety
vocabulary is legitimate — the interview-turn transcript gate (`submit_turn`,
`evaluator`, `followup`, `coaching`) and the Ask Tutor chat. Every other
free-text input (résumé, bio, company, job description, role, industry) uses the
stricter `STRICT_INJECTION_RE` / `STRICT_SHORT_INJECTION_RE` via
`contains_injection(..., strict=True[, short_field=True])` — see the strict-layer
note below. `profile_validation` ORs the strict-short gate with a bare `act as`
for its short structured autocomplete fields (see that module). The frontend
keeps a hand-maintained mirror in `frontend/src/lib/contentPolicy.ts`.

What we DON'T match (false-positive traps — left to the delimiter/clause layer):
  * bare "DAN"            — matches the name "Dan"; we match spelled-out
                            "do anything now" instead.
  * "system update"       — common legit SWE answer ("rolled out a system update").
  * bare "test account"   — "created a test account to QA"; narrowed to
                            "previous … was a test".
  * "no/without any restrictions" — "no restrictions on the budget".
  * bare "act as" / "pretend to be" (non-AI target) — "act as the team lead",
                            "pretend to be confident" are normal behavioral
                            answers; only the AI-targeted forms are matched here.
  * bare "system prompt"  — "I tuned the system prompt for our GPT-4o agent" is
                            normal technical work; only exfiltration/override-
                            framed forms ("reveal/ignore your system prompt") match.
  * "jailbreak"           — genuinely dual-use; red-teamers / AI-safety
                            candidates legitimately discuss "jailbreak testing /
                            resistance". Left to the recall layer.
"""

from __future__ import annotations

import re

# Built as `|`-joined alternations. Tuned for precision: every branch is a phrase
# that is overwhelmingly an injection attempt rather than genuine interview text.
_PATTERNS = [
    # Instruction-override: verb → (≤4-word gap) → previous/prior/all qualifier →
    # (≤2-word gap) → instruction-y target. The required qualifier next to the
    # target keeps "ignore the setup instructions" (legit) from matching while
    # catching "ignore all previous instructions" / "disregard prior directives".
    r"\b(?:ignore|disregard|forget|override|bypass)\b"
    r"(?:\s+\w+){0,4}?\s+"
    r"\b(?:previous|prior|earlier|preceding|aforementioned|above|all)\b"
    r"(?:\s+\w+){0,2}?\s+"
    r"\b(?:instructions?|prompts?|directives?|rules?|messages?|context|commands?)\b",

    # Role reassignment / model impersonation.
    r"\byou\s+are\s+now\b",
    r"\b(?:act\s+as|pretend\s+(?:to\s+be|you(?:'re|\s+are)))\s+(?:an?\s+)?"
    r"(?:ai|a\.i\.|assistant|language\s+model|chat\s?bot|chatgpt|llm)\b",

    # System / developer channel spoofing. "system prompt" only counts when an
    # exfiltration/override verb targets it ("reveal/ignore your system prompt")
    # — bare "system prompt" is a normal technical phrase ("I tuned the system
    # prompt"), see the docstring.
    r"\b(?:reveal|leak|print|repeat|show|expose|dump|disclose|output|disregard|ignore|override|bypass)\b"
    r"(?:\s+\w+){0,3}?\s+(?:the\s+|your\s+|its\s+|my\s+)?system\s+prompt\b",
    r"\bdeveloper\s+(?:message|mode)\b",
    r"\bdo\s+anything\s+now\b",

    # Fake task / instruction handoff.
    r"\b(?:here(?:'s| is)|this is)\s+your\s+(?:next|new)\s+(?:task|instruction|prompt)\b",
    r"\byour\s+(?:new|next|real|actual)\s+(?:task|instruction|job|goal)\s+is\b",
    r"\bnew\s+instructions?\s*:",

    # Authority / context manipulation.
    r"\bprevious\s+(?:user|conversation|session|prompt)\s+was\s+(?:a\s+)?test\b",
]

CONTENT_INJECTION_RE = re.compile("|".join(_PATTERNS), re.IGNORECASE)


# ── Strict layer — every free-text input EXCEPT interview turns + the chatbot ──
#
# Interview-turn transcripts and the Ask Tutor chat stay on the relaxed
# CONTENT_INJECTION_RE above, because candidates legitimately discuss AI-safety /
# prompt-hardening vocabulary there. Every OTHER free-text input — résumé, short
# bio, company, job description, target role, industry — has no reason to contain
# instruction-override or credential-exfiltration phrasing, so it gets this
# stricter gate. Two additions over the relaxed layer:
#
#   1. Target-noun-free override. The relaxed override REQUIRES a trailing
#      "instructions"/"prompts"/... noun, so a typo'd or absent target ("ignore
#      all prior instrucdtions", "disregard previous") slips through. Here the
#      verb + a temporal qualifier (previous/prior/earlier/…) is enough — note we
#      anchor on the *temporal* word, NOT the quantifier "all", so legitimate
#      technical prose ("ignore all warnings", "bypass all rate limits") is left
#      alone. The verbs are matched ONLY in imperative present tense, so past-
#      tense résumé accomplishments ("bypassed all prior limits", "ignored
#      earlier advice") never trip it.
#   2. API-credential exfiltration. Long free-text fields (résumé/bio/JD) block
#      only "send/write … API key" — "write API documentation", "managed API key
#      rotation" are legitimate prose there. Short structured fields
#      (company/role/industry) additionally block any "send/write API…" and a
#      bare "API key", neither of which is ever legitimate in a one-line field.
_STRICT_OVERRIDE = (
    r"\b(?:ignore|disregard|forget|override|bypass)\b"
    r"(?:\s+\w+){0,3}?\s+"
    r"\b(?:previous|prior|earlier|preceding|aforementioned|above)\b"
)
# Long fields: credential exfil requires the word "key" after the verb.
_STRICT_API_EXFIL_KEY = (
    r"\b(?:send|write)\s+(?:me\s+)?(?:the\s+|your\s+|an?\s+)?api\s+key\b"
)
# Short fields: any "send/write API…" plus a bare "API key".
_STRICT_API_SHORT = (
    r"\b(?:send|write)\s+(?:me\s+)?(?:the\s+|your\s+|an?\s+)?api\b"
    r"|\bapi\s+key\b"
)

STRICT_INJECTION_RE = re.compile(
    "|".join(_PATTERNS + [_STRICT_OVERRIDE, _STRICT_API_EXFIL_KEY]), re.IGNORECASE
)
STRICT_SHORT_INJECTION_RE = re.compile(
    "|".join(_PATTERNS + [_STRICT_OVERRIDE, _STRICT_API_SHORT]), re.IGNORECASE
)


def contains_injection(
    text: str | None, *, strict: bool = False, short_field: bool = False
) -> bool:
    """True if `text` trips the deterministic content-injection regex.

    Empty / None is never an injection. Cheap and side-effect-free so callers can
    gate on it before any network / LLM spend.

    Gate strength is chosen by the call site:

    * default (`strict=False`) — relaxed `CONTENT_INJECTION_RE`. Used ONLY for
      interview-turn transcripts and the Ask Tutor chat, where AI-safety /
      prompt-hardening vocabulary is legitimate.
    * `strict=True` — `STRICT_INJECTION_RE` for the long free-text fields
      (résumé, bio, job description): adds the target-noun-free override matcher
      and "send/write API key" exfil.
    * `strict=True, short_field=True` — `STRICT_SHORT_INJECTION_RE` for the short
      structured fields (company, target role, industry): additionally blocks any
      "send/write API…" and a bare "API key".
    """
    if not text:
        return False
    if strict:
        rx = STRICT_SHORT_INJECTION_RE if short_field else STRICT_INJECTION_RE
    else:
        rx = CONTENT_INJECTION_RE
    return bool(rx.search(text))
