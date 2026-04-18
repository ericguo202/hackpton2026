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


class SessionStatus(str, enum.Enum):
    pending = "pending"          # created, not started
    in_progress = "in_progress"  # currently active
    completed = "completed"      # all turns done
    abandoned = "abandoned"      # user dropped off


class InterviewType(str, enum.Enum):
    behavioral = "behavioral"
    technical = "technical"
    mixed = "mixed"
