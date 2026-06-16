"""
Model package — importing this module registers every ORM class on
`Base.metadata`. Alembic's `env.py` does `import app.db.models` so that
`target_metadata = Base.metadata` sees all tables at autogenerate time.
"""

from app.db.models.user import User
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.incident import Incident
from app.db.models.rate_limit import RateLimit
from app.db.models.saved_question import SavedQuestion
from app.db.models.session_feedback import SessionFeedback
from app.db.models.session_metrics import SessionMetrics

__all__ = [
    "User",
    "InterviewSession",
    "InterviewTurn",
    "Incident",
    "RateLimit",
    "SavedQuestion",
    "SessionFeedback",
    "SessionMetrics",
]
