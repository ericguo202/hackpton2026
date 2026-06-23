"""add policy_notification_state table

Tracks the last policy version users have been emailed about, one row per policy
(`'terms'` / `'privacy'` / `'biometric'`). The startup policy-change notifier
compares each policy's `CURRENT_*_VERSION` source constant against the stored
`notified_version` and emails all users when the constant is higher. Persisting
the notified version is what makes a version bump detectable across deploys and
blue-green replicas.

Revision ID: 0018_policy_notif
Revises: 0017_chat_daily_limit
Create Date: 2026-06-22

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32), so anything longer fails the upgrade
bookkeeping write even after the schema changes commit.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018_policy_notif"
down_revision: Union[str, None] = "0017_chat_daily_limit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "policy_notification_state",
        sa.Column("policy_key", sa.Text(), primary_key=True),
        sa.Column("notified_version", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("policy_notification_state")
