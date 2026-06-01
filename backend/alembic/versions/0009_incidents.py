"""add incidents event log

Revision ID: 0009_incidents
Revises: 0008_recent_opening_qs
Create Date: 2026-06-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0009_incidents"
down_revision: Union[str, None] = "0008_recent_opening_qs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column(
            "severity",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'info'"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("clerk_user_id", sa.Text(), nullable=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "occurred_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.Text(), nullable=True, unique=True),
        sa.Column("sent_content", sa.Text(), nullable=True),
        sa.Column("returned_content", postgresql.JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_index("idx_incidents_event_type", "incidents", ["event_type"])
    op.create_index("idx_incidents_user_id", "incidents", ["user_id"])
    op.create_index(
        "idx_incidents_occurred_at",
        "incidents",
        [sa.text("occurred_at DESC")],
    )
    op.create_index("idx_incidents_session_id", "incidents", ["session_id"])


def downgrade() -> None:
    op.drop_index("idx_incidents_session_id", table_name="incidents")
    op.drop_index("idx_incidents_occurred_at", table_name="incidents")
    op.drop_index("idx_incidents_user_id", table_name="incidents")
    op.drop_index("idx_incidents_event_type", table_name="incidents")
    op.drop_table("incidents")
