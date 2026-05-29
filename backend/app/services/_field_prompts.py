"""
Field/industry-tailored prompts for the opening-question generator.

The system prompt sent to Gemini is assembled per-call by
`build_field_system_prompt`:
  1. A single shared intro template (FIELD_PROMPT_INTRO_TEMPLATE) with
     the category name interpolated. The 15 categories share the same
     hard constraints; only the category name varies.
  2. The full theme catalog for the category (FIELD_THEMES — all 5
     themes always shown). This gives the model breadth-of-bucket
     awareness so it can probe behaviors it doesn't see a concrete
     example of in this particular call.
  3. Two example questions sampled randomly from FIELD_EXAMPLES (5 per
     category). Random rotation per call is the load-bearing fix for
     beta-tester reports of "same opening question over and over": when
     the same 5 examples were shown on every call they acted as strong
     attractors and the model converged on them. Showing only 2 (a
     different 2 each call) breaks that.

Source-of-truth markdown: `backend/prompts/opening_question_prompts.md`.
Keep that file and this module in sync.
"""

from __future__ import annotations

import random
from typing import Literal

from app.db.models.enums import ExperienceLevel


FieldCategory = Literal[
    "Technology, Product, and Design",
    "Data, AI/ML, and Analytics",
    "Cybersecurity and Risk",
    "Finance, Banking, and Private Capital",
    "Consulting and Professional Services",
    "Legal, Compliance, and Advocacy",
    "Government and Public Sector",
    "Healthcare and Life Sciences",
    "Sales, Marketing, and Customer Functions",
    "Operations, Supply Chain, and Manufacturing",
    "Retail, Hospitality, and Service",
    "Nonprofit, NGO, and Social Impact",
    "Education and EdTech",
    "Engineering (Non-Software)",
    "Startups and High-Growth Environments",
]

FIELD_CATEGORIES: tuple[FieldCategory, ...] = (
    "Technology, Product, and Design",
    "Data, AI/ML, and Analytics",
    "Cybersecurity and Risk",
    "Finance, Banking, and Private Capital",
    "Consulting and Professional Services",
    "Legal, Compliance, and Advocacy",
    "Government and Public Sector",
    "Healthcare and Life Sciences",
    "Sales, Marketing, and Customer Functions",
    "Operations, Supply Chain, and Manufacturing",
    "Retail, Hospitality, and Service",
    "Nonprofit, NGO, and Social Impact",
    "Education and EdTech",
    "Engineering (Non-Software)",
    "Startups and High-Growth Environments",
)

DEFAULT_CATEGORY: FieldCategory = "Technology, Product, and Design"


FIELD_PROMPT_INTRO_TEMPLATE = """\
You are a behavioral-interview coach preparing a candidate for a mock interview in the field/industry of {category}. Generate exactly ONE opening question.

Hard constraints:
- Exactly ONE sentence. No preamble, markdown, or surrounding quotes.
- Target 15-22 words. Never exceed 25 words.
- Natural, conversational phrasing a human interviewer would use.
- Open-ended and behavioral (STAR).

Return ONLY the question text. Nothing else.\
"""


FIELD_THEMES: dict[FieldCategory, list[str]] = {
    "Technology, Product, and Design": [
        "shipping a critical feature under incomplete requirements",
        "owning a high-severity production incident end-to-end",
        "driving impact beyond writing code or pixels (roadmap / business metrics)",
        "AI-assisted development or design tools, quality, and reviewer trust",
        "handling tough design critique and iterating from user insight",
    ],
    "Data, AI/ML, and Analytics": [
        "translating complex analysis into a decision for non-technical stakeholders",
        "running experiments under ambiguity with messy data",
        "prioritizing an analytics backlog with explicit tradeoffs",
        "identifying model bias or risk and partnering on guardrails",
        "AI-tool reliability and accountability in your workflow",
    ],
    "Cybersecurity and Risk": [
        "leading or supporting incident response under pressure",
        "communicating security risk to executive decision-makers",
        "prioritizing controls under resource constraints",
        "building a secure-by-design culture across engineering / product",
        "ethical handling of sensitive data with least privilege and auditability",
    ],
    "Finance, Banking, and Private Capital": [
        "delivering under extreme deadline pressure",
        "owning and correcting a mistake on a transaction or model",
        "managing a demanding client or partner with sensitive information",
        "diligence work that shifted an investment thesis",
        "debating tradeoffs with deal team partners",
    ],
    "Consulting and Professional Services": [
        "leading without authority to deliver client impact",
        "resetting expectations after client pushback on a recommendation",
        "scoping and sequencing a messy, ambiguous engagement",
        "structured communication under stress",
        "balancing short-term client asks with long-term value",
    ],
    "Legal, Compliance, and Advocacy": [
        "navigating a conflict of interest or privilege concern",
        "balancing client goals with legal / risk constraints",
        "managing a heavy caseload under tight deadlines",
        "aligning business partners on risk across functions",
        "handling sensitive issues with confidentiality and stakeholder trust",
    ],
    "Government and Public Sector": [
        "implementing policy with public accountability",
        "balancing competing community interests",
        "delivering at pace under budget / procurement constraints",
        "leading cross-agency collaboration with responsible data sharing",
        "preparing for audit or oversight",
    ],
    "Healthcare and Life Sciences": [
        "de-escalating a difficult patient or family situation",
        "high-pressure handoffs and emergency coordination",
        "learning from an adverse event at the system level",
        "protecting privacy under HIPAA while maintaining continuity of care",
        "balancing clinical quality with operational / financial pressures",
    ],
    "Sales, Marketing, and Customer Functions": [
        "winning a deal by multi-threading stakeholders (sales)",
        "recovering from a behind-quota period (sales)",
        "turning around an at-risk customer account (customer success)",
        "optimizing a campaign through experimentation (marketing)",
        "managing brand or crisis communications (comms / PR)",
    ],
    "Operations, Supply Chain, and Manufacturing": [
        "Lean / Six Sigma-style root-cause process improvement",
        "managing a supplier or logistics disruption",
        "choosing safety / quality over throughput",
        "cross-functional work to reduce defects or downtime",
        "preparing for or responding to a regulatory / quality audit",
    ],
    "Retail, Hospitality, and Service": [
        "turning a dissatisfied customer into a loyal one",
        "balancing upselling with guest satisfaction",
        "leading through a peak rush",
        "covering multiple roles or shifts at short notice",
        "handling a policy exception fairly",
    ],
    "Nonprofit, NGO, and Social Impact": [
        "centering beneficiary needs in a tough decision",
        "operating under tight budget constraints with donor stakeholders",
        "recruiting and managing volunteers or partners",
        "leading a fundraising effort and donor stewardship",
        "navigating restricted funding while maximizing program impact",
    ],
    "Education and EdTech": [
        "differentiated instruction for diverse learners",
        "handling challenging classroom behavior inclusively",
        "partnering with families on a sensitive issue",
        "implementing a new learning tool with measurable gains (edtech)",
        "leading through a school crisis or urgent issue",
    ],
    "Engineering (Non-Software)": [
        "exercising stop-work authority or enforcing safety standards",
        "managing field project changes (schedule / cost / quality)",
        "diagnosing a complex on-site technical issue",
        "coordinating contractors and clients under constraints",
        "documenting lessons learned and updating standards",
    ],
    "Startups and High-Growth Environments": [
        "acting decisively on incomplete information",
        "owning an initiative end-to-end and measuring results",
        "wearing multiple hats and setting up scrappy-but-scalable processes",
        "disagreeing with a founder or product direction and then committing",
        "using AI or automation to multiply team productivity with guardrails",
    ],
}


FIELD_EXAMPLES: dict[FieldCategory, list[str]] = {
    "Technology, Product, and Design": [
        "Tell me about a time you shipped a critical feature with incomplete requirements—how did you reduce ambiguity, manage risk, and measure the outcome?",
        "Describe a high-severity production incident you owned end to end—what were your escalation steps, cross-team communications, and postmortem learnings?",
        "Give an example of driving impact beyond writing code or pixels—how did you influence roadmap or business metrics through collaboration or process changes?",
        "Tell me about a time you used AI-assisted development or design tools—how did you ensure code/design quality, security, and reviewer trust?",
        "Describe a situation where you handled tough design critique and iterated—how did user insights translate into measurable product changes while balancing business and technical constraints?",
    ],
    "Data, AI/ML, and Analytics": [
        "Tell me about a time you translated complex analysis into a decision for non-technical stakeholders—how did you tailor the story and what was the measurable impact?",
        "Describe an experiment you led under ambiguity—how did you define hypotheses, handle messy data, and decide when results were actionable?",
        "Give an example of prioritizing an analytics backlog—what tradeoffs did you make and how did you communicate them?",
        "Tell me about a time you identified potential bias or model risk—how did you assess impact, partner with legal/compliance, and implement guardrails?",
        "Describe how you use AI tools in your workflow (coding, analysis, QA)—what checks did you apply to ensure reliability and accountability?",
    ],
    "Cybersecurity and Risk": [
        "Tell me about a time you led or supported incident response—how did you triage, communicate with stakeholders, and coordinate remediation under pressure?",
        "Describe a situation where you had to explain security risk to executives—how did you balance usability, cost, and compliance to gain a decision?",
        "Give an example of prioritizing controls with limited resources—what framework did you use and what outcomes did you achieve?",
        "Tell me about a time you built security culture—how did you gain buy-in from engineering/product for secure-by-design practices?",
        "Describe a situation involving sensitive data—how did you ensure ethical handling, least privilege, and auditability?",
    ],
    "Finance, Banking, and Private Capital": [
        "Tell me about a time you delivered under extreme deadline pressure—how did you protect quality, coordinate the team, and manage stress?",
        "Describe a mistake you owned on a transaction or model—how did you surface it, correct it, and prevent recurrence?",
        "Give an example of managing a demanding client or partner—how did you navigate sensitive information and resolve conflict?",
        "Tell me about a diligence process that changed your investment thesis—what signals mattered and how did you align the team?",
        "Describe a debate with deal team partners on tradeoffs—how did you present the case, handle pushback, and reach a decision?",
    ],
    "Consulting and Professional Services": [
        "Tell me about a time you led without authority to drive client impact—what structure did you use and what measurable outcome resulted?",
        "Describe a situation where a client pushed back on your recommendation—how did you reset expectations and influence the decision with data/story?",
        "Give an example of a messy, ambiguous engagement you scoped and iterated—how did you de-risk and sequence the work?",
        "Tell me about a time you had to deliver structured communication under stress—what was your framework and what was the result?",
        "Describe how you balanced short-term asks with long-term value for a client—how did you align stakeholders?",
    ],
    "Legal, Compliance, and Advocacy": [
        "Tell me about a time you navigated a conflict of interest or privilege concern—what steps did you take to protect ethics and confidentiality?",
        "Describe a situation where you balanced client goals with legal/risk constraints—how did you negotiate tradeoffs and document your advice?",
        "Give an example of managing a heavy caseload under tight deadlines—how did you triage, communicate status, and ensure quality?",
        "Tell me about a cross-functional matter where you aligned business partners on risk—how did you build consensus and memorialize decisions?",
        "Describe a sensitive issue you handled discreetly—how did you manage confidentiality and stakeholder trust?",
    ],
    "Government and Public Sector": [
        "Tell me about a time you implemented policy with strong public accountability—how did you ensure transparency, compliance, and measurable outcomes?",
        "Describe an instance of balancing competing community interests—how did you engage stakeholders and reach a fair decision?",
        "Give an example of delivering at pace under budget/procurement constraints—what tradeoffs did you make and how did you manage risk?",
        "Tell me about cross-agency collaboration you led—how did you clarify roles, share data responsibly, and maintain momentum?",
        "Describe how you prepared for audit or oversight—what controls and documentation did you establish?",
    ],
    "Healthcare and Life Sciences": [
        "Tell me about a time you de-escalated a difficult patient or family situation—how did you advocate for safety and maintain empathy?",
        "Describe a high-pressure handoff or emergency—how did you communicate, coordinate the team, and what did you learn?",
        "Give an example of learning from an adverse event—how did you contribute to system-level changes or training?",
        "Tell me about a situation involving HIPAA/confidentiality—how did you protect privacy while ensuring continuity of care?",
        "Describe a time you balanced clinical quality with operational/financial pressures—what metrics did you use and what was the outcome?",
    ],
    "Sales, Marketing, and Customer Functions": [
        "Sales: Tell me about a deal you won by multi-threading stakeholders—how did you handle objections, partner internally, and land the business?",
        "Sales: Describe a time you were behind quota—what actions did you take, what did you learn, and how did you finish the period?",
        "Customer Success: Give an example of turning around an at-risk account—how did you drive value realization and secure renewal/expansion?",
        "Marketing: Tell me about a campaign you optimized through experimentation—what metrics guided pivots and what ROI did you achieve?",
        "Communications/PR: Describe handling a brand or crisis comms issue—how did you align cross-functionally and protect reputation?",
    ],
    "Operations, Supply Chain, and Manufacturing": [
        "Tell me about a process you improved using Lean/Six Sigma—what root cause did you find, what countermeasures, and what sustained results?",
        "Describe a time you managed a supplier or logistics disruption—how did you coordinate S&OP, communicate to customers, and restore service?",
        "Give an example of choosing safety/quality over throughput—what was the decision, how did you justify it, and what was the impact?",
        "Tell me about a cross-functional effort to reduce defects or downtime—what KPIs moved and how did you maintain standard work?",
        "Describe preparing for or responding to a regulatory/quality audit—how did you ensure compliance and close gaps?",
    ],
    "Retail, Hospitality, and Service": [
        "Tell me about a time you turned a dissatisfied customer into a loyal one—what steps did you take and what feedback or metrics improved?",
        "Describe how you balanced upselling with guest satisfaction—what cues did you read and how did you personalize the approach?",
        "Give an example of leading through a peak rush—how did you reallocate roles, communicate, and keep service levels high?",
        "Tell me about covering multiple roles or shifts at short notice—how did you prioritize tasks and maintain standards?",
        "Describe handling a policy exception—how did you resolve it fairly while upholding brand and risk guidelines?",
    ],
    "Nonprofit, NGO, and Social Impact": [
        "Tell me about a time you centered beneficiary needs in a tough decision—how did you engage the community and measure impact?",
        "Describe operating under tight budget constraints—how did you prioritize programs and communicate tradeoffs to stakeholders or donors?",
        "Give an example of recruiting/managing volunteers or partners—how did you align goals and ensure accountability?",
        "Tell me about a fundraising effort you led—how did you segment donors, communicate impact, and steward relationships?",
        "Describe navigating restricted funding—how did you ensure compliance while maximizing program outcomes?",
    ],
    "Education and EdTech": [
        "Tell me about a time you differentiated instruction to support diverse learners—what strategies and outcomes did you see?",
        "Describe how you handled a challenging classroom behavior—how did you create a safe, inclusive environment?",
        "Give an example of partnering with families on a sensitive issue—how did you communicate and what changed for the student?",
        "EdTech: Tell me about implementing a new learning tool—how did you train staff, measure learning gains, and iterate?",
        "Leadership: Describe responding to a school crisis or urgent issue—how did you coordinate staff and support equity-minded decisions?",
    ],
    "Engineering (Non-Software)": [
        "Tell me about a time you exercised stop-work authority or enforced safety standards—what led to the decision and what was the result?",
        "Describe managing project changes in the field—how did you handle change orders, update stakeholders, and protect schedule/cost/quality?",
        "Give an example of diagnosing a complex technical issue on-site—what was your troubleshooting approach and what did you learn?",
        "Tell me about coordinating with contractors and clients under constraints—how did you resolve conflicts and meet specifications?",
        "Describe how you documented lessons learned and updated standards or procedures—what impact did it have on future work?",
    ],
    "Startups and High-Growth Environments": [
        "Tell me about a time you acted with incomplete information—how did you de-risk quickly, make the call, and what did you learn?",
        "Describe owning an initiative end to end—how did you define success, align stakeholders, and measure results?",
        "Give an example of wearing multiple hats—how did you set up scrappy processes that scaled as the company grew?",
        "Tell me about a time you disagreed with a founder or product direction—how did you handle it and commit to execution?",
        "Describe how you used AI or automation to increase team productivity—what guardrails did you put in place to maintain quality and trust?",
    ],
}


def build_field_system_prompt(
    category: FieldCategory,
    experience_level: ExperienceLevel | None = None,
    rng: random.Random | None = None,
) -> str:
    """Assemble the per-call system prompt for the opening-question generator.

    - Intro is the constant template with the category name substituted.
    - Themes catalog (all 5) is shown so the model knows what behaviors
      this bucket can probe — not just the 2 examples it sees below.
    - 2 example questions are sampled at random per call. This rotation
      is the load-bearing fix for users getting the same opening
      question repeatedly across sessions: the 5 fixed examples acted
      as strong attractors and the model converged on them; showing
      only 2 (a different 2 each call) breaks that.
    - When `experience_level` is known, the matching experience-level
      paragraph (from `_experience_prompts`) leads as the PRIMARY driver
      and the broad field themes are demoted to background, so an intern
      and an executive in the same field get differently-calibrated
      questions instead of the model gravitating to a generic theme.
      When it's None (legacy users) the section is omitted and output is
      byte-identical to the category-only behavior — same empty-omission
      discipline as `_company_digest`.

    `rng` is injectable so tests can pin the sample deterministically;
    production callers pass `None` to get fresh randomness per call.
    """
    # Imported lazily to avoid a circular import: `_experience_prompts`
    # imports FieldCategory / FIELD_CATEGORIES from this module.
    from app.services._experience_prompts import experience_question_block

    themes = FIELD_THEMES.get(category) or FIELD_THEMES[DEFAULT_CATEGORY]
    examples = FIELD_EXAMPLES.get(category) or FIELD_EXAMPLES[DEFAULT_CATEGORY]
    sampler = rng if rng is not None else random
    sampled = sampler.sample(examples, 2) if len(examples) >= 2 else list(examples)

    intro = FIELD_PROMPT_INTRO_TEMPLATE.format(category=category)
    themes_block = "\n".join(f"  - {t}" for t in themes)
    examples_block = "\n".join(f"  - {e}" for e in sampled)
    style_cues = (
        "Style cues (concrete shapes — emulate the spirit, not the wording):\n"
        f"{examples_block}"
    )

    experience_block = experience_question_block(category, experience_level)
    if experience_block:
        # Experience-level path: the seniority guidance is the PRIMARY driver
        # and the field themes are demoted to background, so the model picks a
        # level-appropriate scenario instead of gravitating to a generic
        # (often senior-sounding) theme.
        return (
            f"{intro}\n\n"
            "PRIMARY DRIVER — match the scenario, scope, and difficulty to this "
            "candidate's experience level. Let this dominate the question you "
            f"choose:\n{experience_block}\n\n"
            "Field breadth (BACKGROUND only — behaviors this field can probe). "
            "Stay on-domain, but do NOT choose a theme that ignores or "
            f"contradicts the experience-level focus above:\n{themes_block}\n\n"
            f"{style_cues}"
        )

    # Legacy path (no experience level): unchanged wording/order. Kept
    # byte-identical so the regression and the existing builder tests hold.
    return (
        f"{intro}\n\n"
        f"This field tests behaviors across these themes (use this as the "
        f"breadth of what you can probe — do NOT limit yourself to the two "
        f"examples below):\n{themes_block}\n\n"
        f"{style_cues}"
    )
