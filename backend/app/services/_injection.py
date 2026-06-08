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

`CONTENT_INJECTION_RE` is the canonical pattern reused by `evaluator`,
`opening_question`, `followup`, `coaching`, the `submit_turn` transcript gate, and
the `onboarding` bio/résumé gate. `profile_validation` ORs it with a bare
`act as` for its short structured autocomplete fields (see that module). The
frontend keeps a hand-maintained mirror in `frontend/src/lib/contentPolicy.ts`.

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

    # System / developer channel spoofing.
    r"\bsystem\s+prompt\b",
    r"\bdeveloper\s+(?:message|mode)\b",
    r"\bjailbreak",
    r"\bdo\s+anything\s+now\b",

    # Fake task / instruction handoff.
    r"\b(?:here(?:'s| is)|this is)\s+your\s+(?:next|new)\s+(?:task|instruction|prompt)\b",
    r"\byour\s+(?:new|next|real|actual)\s+(?:task|instruction|job|goal)\s+is\b",
    r"\bnew\s+instructions?\s*:",

    # Authority / context manipulation.
    r"\bprevious\s+(?:user|conversation|session|prompt)\s+was\s+(?:a\s+)?test\b",
]

CONTENT_INJECTION_RE = re.compile("|".join(_PATTERNS), re.IGNORECASE)


def contains_injection(text: str | None) -> bool:
    """True if `text` trips the deterministic content-injection regex.

    Empty / None is never an injection. Cheap and side-effect-free so callers can
    gate on it before any network / LLM spend.
    """
    return bool(text and CONTENT_INJECTION_RE.search(text))
