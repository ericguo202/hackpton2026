"""
Field/industry taxonomy — the shared domain axis.

`FieldCategory` classifies a session's field/industry into one of 15 buckets. It
is the **domain-context axis**, orthogonal to the experience-level axis and the
question-category axis (STAR / self-assessment / motivation-fit / situational).
It is NOT specific to any one question type — every question type is tailored by
this same field vocabulary — so it lives in its own module rather than inside the
STAR-specific prompt modules (`_star_opening_prompts`, `_star_evaluator_rubric`).

`company_research` classifies each session into one of these buckets; the
opening-question, evaluator, follow-up, and coaching stacks all key their
field-tailored guidance off the result.
"""

from __future__ import annotations

from typing import Literal


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
