"""Tracks the last policy version we've emailed users about.

One row per policy (`'terms'` / `'privacy'` / `'biometric'`). The
policy-change notifier compares each policy's `CURRENT_*_VERSION` source constant
against the stored `notified_version`; when the constant is higher it emails all
users and bumps the row. This persistence is what lets a version bump be detected
across deploys / blue-green replicas (the constants alone carry no "already
notified" memory). Email by sending request to Mailgun.
"""

from datetime import datetime

from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class PolicyNotificationState(Base):
    __tablename__ = "policy_notification_state"

    policy_key: Mapped[str] = mapped_column(Text, primary_key=True)
    notified_version: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
