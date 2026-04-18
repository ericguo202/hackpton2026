"""
Model package — importing this module registers every ORM class on
`Base.metadata`. Alembic's `env.py` does `import app.db.models` so that
`target_metadata = Base.metadata` sees all tables at autogenerate time.
"""

from app.db.models.user import User
from app.db.models.interview_config import InterviewConfig
from app.db.models.interview_session import InterviewSession
from app.db.models.interview_turn import InterviewTurn
from app.db.models.session_metrics import SessionMetrics

__all__ = [
    "User",
    "InterviewConfig",
    "InterviewSession",
    "InterviewTurn",
    "SessionMetrics",
]
