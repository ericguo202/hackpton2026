"""add server-side delivery analytics consent fields

Practice can persist browser-computed webcam delivery summaries in
interview_turns.cv_summary. Calibration consent is browser-local and does not
prove consent for that server-side artifact, so users now carry a versioned
consent timestamp plus a revocation timestamp.

Revision ID: 0013_delivery_consent
Revises: 0012_session_feedback
Create Date: 2026-06-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_delivery_consent"
down_revision: Union[str, None] = "0012_session_feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "delivery_analytics_consent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "delivery_analytics_consent_version",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "delivery_analytics_revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "delivery_analytics_revoked_at")
    op.drop_column("users", "delivery_analytics_consent_version")
    op.drop_column("users", "delivery_analytics_consent_at")
