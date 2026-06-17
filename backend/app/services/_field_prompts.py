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
  3. Two example questions sampled randomly from FIELD_EXAMPLES (a
     pool of several per category). Random rotation per call is the
     load-bearing fix for beta-tester reports of "same opening question
     over and over": when a small fixed set was shown on every call it
     acted as a strong attractor and the model converged on it. Showing
     only 2 (a different 2 each call) from a larger pool breaks that.

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
- Output ONLY the question text — exactly ONE sentence, no preamble, markdown, or surrounding quotes.
- Ideally 20-25 words. Never exceed 30 words.
- Natural, conversational phrasing a human interviewer would use.
- Open-ended and behavioral — invites a single specific past story the candidate can answer in STAR form.\
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
        "Tell me about a time you had to ship something important when the requirements still weren't fully clear.",
        "Walk me through a serious production incident you took ownership of from start to finish.",
        "Tell me about a time you made an impact that went beyond just writing code or designing screens.",
        "Tell me about a time you used AI tools in your work and how you made sure the output was trustworthy.",
        "Tell me about a time you got tough, critical feedback on something you designed or built.",
        "Tell me about a time you had to reduce ambiguity and manage risk on a project that was still unclear.",
        "Tell me about a time you had to figure out how to measure whether what you shipped actually worked.",
        "Walk me through how you handled escalation and cross-team communication during a high-severity incident.",
        "Tell me about a time you ran a postmortem and what your team changed because of it.",
        "Tell me about a time you influenced the product roadmap or a business metric through how you worked.",
        "Tell me about a time user insights led you to make a measurable change to the product.",
        "Tell me about a time you had to balance business needs against technical constraints.",
    ],
    "Data, AI/ML, and Analytics": [
        "Tell me about a time you had to explain a complex analysis to people who weren't technical.",
        "Walk me through an analysis you ran when the data was messy and the answer wasn't obvious.",
        "Tell me about a time you had to decide which analytics work to prioritize and what to set aside.",
        "Tell me about a time you spotted potential bias or risk in a model and what you did about it.",
        "Tell me about how you use AI tools in your work and how you make sure you can trust the results.",
        "Tell me about a time you tailored how you presented an analysis so it actually drove a decision.",
        "Tell me about a time you had to decide when your results were solid enough to act on.",
        "Tell me about a time you had to define and test a hypothesis with messy data.",
        "Tell me about a time you partnered with legal or compliance to put guardrails around a model.",
    ],
    "Cybersecurity and Risk": [
        "Walk me through a security incident you helped respond to and how you handled the pressure.",
        "Tell me about a time you had to explain a security risk to senior leaders who weren't technical.",
        "Tell me about a time you had to decide which security controls to prioritize with limited resources.",
        "Tell me about a time you got engineering or product teams to take security more seriously.",
        "Tell me about a time you handled sensitive data and how you made sure it stayed protected.",
        "Tell me about a time you had to triage and coordinate remediation during a security incident.",
        "Tell me about a time you had to balance security against usability and cost to land a decision.",
        "Tell me about a time you made sure sensitive data was handled with least privilege and auditability.",
    ],
    "Finance, Banking, and Private Capital": [
        "Tell me about a time you had to deliver high-quality work under an intense deadline.",
        "Tell me about a mistake you made on a deal or a model and how you handled it.",
        "Tell me about a time you managed a demanding client or partner in a sensitive situation.",
        "Walk me through a time your diligence changed how you or your team saw an investment.",
        "Tell me about a time you disagreed with your deal team about a tradeoff or a decision.",
        "Tell me about a time you kept your team coordinated and calm under intense pressure.",
        "Tell me about a time you put something in place to prevent a mistake from happening again.",
        "Tell me about a time you had to align your team around a key signal or finding.",
        "Tell me about a time you had to make your case and handle pushback to reach a decision.",
    ],
    "Consulting and Professional Services": [
        "Tell me about a time you had to lead a team or project without any formal authority.",
        "Tell me about a time a client pushed back on your recommendation and how you responded.",
        "Tell me about a messy, ambiguous project and how you figured out where to start.",
        "Tell me about a time you had to communicate something complicated clearly while under pressure.",
        "Tell me about a time you had to balance what a client wanted now against what was best long-term.",
        "Tell me about a time you used a clear structure to drive a measurable outcome for a client.",
        "Tell me about a time you used data or a story to influence a client's decision.",
        "Tell me about a time you had to de-risk and sequence a complicated piece of work.",
        "Tell me about a time you had to align different stakeholders behind a single plan.",
    ],
    "Legal, Compliance, and Advocacy": [
        "Tell me about a time you ran into a conflict of interest or a tricky privilege question.",
        "Tell me about a time you had to balance what the business wanted against the legal or compliance risk.",
        "Tell me about a time you managed a heavy caseload or workload under tight deadlines.",
        "Tell me about a time you had to get different teams aligned on how to handle a risk.",
        "Tell me about a sensitive matter you handled and how you protected confidentiality and trust.",
        "Tell me about a time you took deliberate steps to protect ethics and confidentiality in a tough spot.",
        "Tell me about a time you had to negotiate a tradeoff and carefully document the advice you gave.",
        "Tell me about a time you built consensus across functions and made sure the decision was documented.",
    ],
    "Government and Public Sector": [
        "Tell me about a time you implemented a policy or program while the public was watching closely.",
        "Tell me about a time you had to balance competing interests from different parts of the community.",
        "Tell me about a time you delivered results despite tight budget or procurement constraints.",
        "Walk me through a time you led collaboration across different agencies or departments.",
        "Tell me about a time you prepared for an audit or an oversight review.",
        "Tell me about a time you had to ensure transparency and accountability on a public program.",
        "Tell me about a time you engaged stakeholders to reach a fair decision.",
        "Tell me about a time you had to share data responsibly across agencies or departments.",
    ],
    "Healthcare and Life Sciences": [
        "Tell me about a time you calmed down a difficult situation with a patient or their family.",
        "Walk me through a high-pressure handoff or emergency and how you coordinated with your team.",
        "Tell me about a time something went wrong with care and what you learned from it afterward.",
        "Tell me about a time you had to protect patient privacy while still delivering good care.",
        "Tell me about a time you had to balance quality of care against operational or financial pressure.",
        "Tell me about a time you advocated for a patient's safety while showing empathy.",
        "Tell me about a time an adverse event led to a change in your team's process or training.",
        "Tell me about a time you used specific metrics to improve a care or operational outcome.",
    ],
    "Sales, Marketing, and Customer Functions": [
        "Tell me about a big deal you won and how you built support across the customer's organization.",
        "Tell me about a time you fell behind on your numbers and how you turned the period around.",
        "Tell me about a time you saved a customer relationship that was at risk of falling apart.",
        "Walk me through a campaign you improved by testing and learning from the results.",
        "Tell me about a time you had to manage a brand issue or a communications crisis.",
        "Tell me about a time you handled tough objections to win a piece of business.",
        "Tell me about a time you partnered with internal teams to get a deal across the line.",
        "Tell me about a time you drove a renewal or expansion by proving value to a customer.",
        "Tell me about a time you aligned cross-functional teams to protect the company's reputation.",
    ],
    "Operations, Supply Chain, and Manufacturing": [
        "Tell me about a time you found the root cause of a process problem and fixed it for good.",
        "Tell me about a time you had to manage a supplier or logistics disruption.",
        "Tell me about a time you chose safety or quality even though it slowed things down.",
        "Walk me through a time you worked across teams to cut down defects or downtime.",
        "Tell me about a time you prepared for or handled a regulatory or quality audit.",
        "Tell me about a time you kept customers informed while you worked to restore service.",
        "Tell me about a time you had to justify a tough safety or quality decision and what impact it had.",
        "Tell me about a time you moved a key KPI while keeping standard work in place.",
    ],
    "Retail, Hospitality, and Service": [
        "Tell me about a time you turned an unhappy customer into a happy, loyal one.",
        "Tell me about a time you balanced making a sale against keeping the guest genuinely happy.",
        "Tell me about a time you kept things running smoothly during a really busy rush.",
        "Tell me about a time you had to cover extra roles or shifts on short notice.",
        "Tell me about a time you had to handle an exception to policy fairly.",
        "Tell me about a time you read a customer's cues and personalized your approach.",
        "Tell me about a time you reallocated your team during a rush to keep service levels high.",
        "Tell me about a time you upheld brand or risk guidelines while resolving a customer's problem.",
    ],
    "Nonprofit, NGO, and Social Impact": [
        "Tell me about a tough decision where you had to put the people you serve first.",
        "Tell me about a time you had to do a lot with a very limited budget.",
        "Tell me about a time you recruited or managed volunteers or partners.",
        "Walk me through a fundraising effort you led and how you built relationships with donors.",
        "Tell me about a time you had to work within restricted funding while still delivering impact.",
        "Tell me about a time you engaged the community and measured the impact of your work.",
        "Tell me about a time you prioritized programs and explained the tradeoffs to donors or stakeholders.",
        "Tell me about a time you aligned volunteers or partners around a shared goal and held them accountable.",
    ],
    "Education and EdTech": [
        "Tell me about a time you adapted your teaching to reach students with very different needs.",
        "Tell me about a time you handled a challenging classroom situation while keeping it inclusive.",
        "Tell me about a time you worked with a family on a sensitive issue about their child.",
        "Tell me about a time you rolled out a new learning tool and how you knew it was working.",
        "Tell me about a time you helped lead through a crisis or an urgent issue at your school.",
        "Tell me about a time a strategy you tried led to a real improvement in student outcomes.",
        "Tell me about a time you trained staff on a new tool and measured whether it improved learning.",
        "Tell me about a time you coordinated staff to support an equity-minded decision.",
    ],
    "Engineering (Non-Software)": [
        "Tell me about a time you stopped work or enforced a safety standard, even when it was hard.",
        "Tell me about a time you had to manage changes to a project out in the field.",
        "Tell me about a time you diagnosed a tricky technical problem on-site.",
        "Tell me about a time you coordinated contractors and clients under tight constraints.",
        "Tell me about a time you captured lessons learned and improved a standard or procedure.",
        "Tell me about a time you handled change orders while protecting schedule, cost, and quality.",
        "Tell me about a time you had to update stakeholders as a field project changed.",
        "Tell me about a time you had to resolve a conflict to keep a project on spec.",
    ],
    "Startups and High-Growth Environments": [
        "Tell me about a time you had to make a big call without having all the information.",
        "Walk me through an initiative you owned from start to finish and how you measured success.",
        "Tell me about a time you wore a lot of hats and built something scrappy that still scaled.",
        "Tell me about a time you disagreed with a founder or the product direction and what happened.",
        "Tell me about a time you used AI or automation to make your team more productive.",
        "Tell me about a time you had to de-risk a decision quickly before making the call.",
        "Tell me about a time you disagreed with a decision but fully committed once it was made.",
        "Tell me about a time you put guardrails in place to keep quality and trust high while moving fast.",
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
      question repeatedly across sessions: a small fixed set acted
      as a strong attractor and the model converged on it; showing
      only 2 (a different 2 each call) from a larger pool breaks that.
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
