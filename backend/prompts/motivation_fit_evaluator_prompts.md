# Motivation & Fit — evaluator prompts

Source-of-truth markdown for `backend/app/services/_motivation_fit_evaluator_rubric.py`.

Unlike the STAR evaluator (15 per-field appendices), the Motivation & Fit rubric is
**field-independent** — M&F questions barely change across industries. What varies is the
fit-culture **archetype** (from `_archetypes.py`) and the **experience level**. The system
prompt assembled by `build_motivation_fit_system_instruction(category, experience_level)` is:

1. the static base rubric below (a clean prompt-cache prefix);
2. the archetype **weighting note** + **Conviction taboos** (resolved from the field category
   via `archetype_for`);
3. a **level-scaled Company Insight anchor** (entry = effort/specificity; mid/senior = self→role
   mapping; staff/exec = strategic-situation awareness);
4. the **archetype × level** experience block (from `motivation_fit_experience_prompts.md`).

The evaluator emits M&F **semantic keys** (`structure`, `relevance`, `company_insight`,
`career_narrative`, `conviction`); `evaluate_turn` remaps them onto the generic `dimension_1..5`
columns. The STAR-specific `_calibrate_content_scores` is **skipped** for Motivation & Fit.
Keep this file and the Python module in sync.

## Score keys / JSON contract

```json
{
  "structure": 0,
  "relevance": 0,
  "company_insight": 0,
  "career_narrative": 0,
  "conviction": 0,
  "feedback_detail": { ...same shape as the STAR evaluator... }
}
```

`issue_type` for Motivation & Fit: `generic_pitch | no_company_specifics | incoherent_narrative |
mercenary_framing | does_not_answer_question | rambling | unprofessional | weak_wording`.

## Dimension definitions (0–10)

- **structure** — purposeful narrative shape. High (8–10): "tell me about yourself" follows a
  present → past → future arc (or an equivalent deliberate frame), selects rather than recites, and
  ends pointed at this role. Mid (4–7): a chronological résumé walk with weak selection. Low (0–3):
  rambling biography or disconnected fragments. Penalize reciting the résumé line by line.
- **relevance** — mapping between background and this role. High: selects the two or three
  experiences that match the role's actual requirements and states why they transfer. Mid: mentions
  background but leaves the mapping implicit or generic. Low: an interchangeable pitch. Reward
  explicit linkage to the job description / role needs.
- **company_insight** — evidence of homework, graded against the researched company/role facts.
  High: specific, accurate facts (product, mission, recent moves, documented values) connected to
  motivation; alignment with the brief's role values scores highest. Mid: correct but surface-level
  ("great culture"). Low: no company-specific content or wrong facts. When the brief has no role
  values, grade on specificity and plausibility alone.
- **career_narrative** — coherence and plausibility. High: choices and transitions form a believable
  through-line; motivations consistent with past decisions; goals follow logically. Mid: mostly
  coherent with unexplained jumps. Low: contradictory or implausible motivation. Penalize
  inconsistency between the stated "why" and the actual history.
- **conviction** — genuine, specific enthusiasm from CONTENT, not tone (tone → Delivery). High:
  motivation through specifics (what attracts them, what they'd work on first, why now). Mid:
  positive but boilerplate. Low: indifference, mercenary framing, or scripted flattery. A score
  above 5 requires enthusiasm attached to at least one concrete particular of the role or company.

## Scale + calibration

Same 9–10 / 7–8 / 4–6 / 1–3 / 0 bands as STAR. All-zero only for off-topic / unintelligible /
inappropriate / manipulation. Score from evidence, not tone; > 5 requires explicit evidence for that
quality. Per-dimension "lower when evidence absent": no company-specific fact → company_insight low;
interchangeable pitch → relevance low; no concrete particular → conviction low; unexplained jump /
contradictory "why" → career_narrative low; recited or rambling shape → structure low.

**No deterministic post-LLM calibration** for Motivation & Fit — the STAR `_calibrate_content_scores`
(metrics → impact, "I"-ownership → initiative) is skipped because a good "why this company" answer
legitimately lacks that evidence.

## Feedback rules

Identical to the STAR evaluator (`positive_moments` ≤ 3, `improvement_moments` ≤ 4, `quick_wins` ≤ 3;
exact transcript snippets ≤ 120 chars; never write a full ideal answer; balance strengths and fixes),
except the `issue_type` set above and the M&F-flavored examples. See the Python module for the exact
character budgets (mirrored in `evaluator.py`).
