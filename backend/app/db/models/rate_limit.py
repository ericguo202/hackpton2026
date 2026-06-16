"""
`rate_limits` — fixed-window request counters for per-user API throttling.

One row per (user, bucket). `bucket` names the throttled operation (e.g.
"autocomplete", "onboarding") so a user's quota on cheap autocomplete calls is
tracked independently of their heavier onboarding quota. `window_start` is the
epoch-second boundary of the current fixed window (now floored to the window
size); `count` is how many requests have landed in that window so far.

Lives in Postgres (not in process memory) on purpose: the API runs as two
blue/green replicas behind Caddy, so an in-process counter would only see half
the traffic and the effective limit would silently double. A shared DB row is
authoritative across replicas. See `app/services/rate_limit.py` for the atomic
upsert that increments it race-free.
"""

from uuid import UUID

from sqlalchemy import BigInteger, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RateLimit(Base):
    __tablename__ = "rate_limits"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Operation name — lets one user hold independent windows per endpoint class.
    bucket: Mapped[str] = mapped_column(Text, primary_key=True)
    # Epoch-second start of the current fixed window (now // window * window).
    window_start: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Requests counted in the current window.
    count: Mapped[int] = mapped_column(Integer, nullable=False)
