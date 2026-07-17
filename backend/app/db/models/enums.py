"""
Shared Postgres ENUM types.

The DB objects themselves are created in the initial Alembic migration
(0001_init). ORM columns reference them with `create_type=False` so
SQLAlchemy doesn't try to CREATE TYPE again on table creation.
"""

import enum


class ExperienceLevel(str, enum.Enum):
    internship = "internship"
    entry = "entry"
    mid = "mid"
    senior = "senior"
    staff = "staff"
    executive = "executive"


class QuestionCategory(str, enum.Enum):
    """The FORM of an interview question (the new orthogonal axis).

    Today every question is `experience_star` (the classic "tell me about a
    time…" behavioral prompt); the other three are documented in CLAUDE.md's
    question-type taxonomy but not yet generated. Stored on
    `interview_turns.question_category` (default `experience_star`) so each turn
    is labeled by its type and the four-type expansion has a clean seam.
    """

    experience_star = "experience_star"
    self_assessment_growth = "self_assessment_growth"
    motivation_fit = "motivation_fit"
    situational = "situational"


class SessionStatus(str, enum.Enum):
    pending = "pending"          # created, not started
    in_progress = "in_progress"  # currently active
    completed = "completed"      # all turns done
    abandoned = "abandoned"      # user dropped off


class UserTier(str, enum.Enum):
    free = "free"
    pro = "pro"
