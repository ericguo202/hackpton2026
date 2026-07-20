"""add calibrated_mix flag to sessions

Revision ID: 0027_session_calibrated_mix
Revises: 0026_generic_dimensions
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027_session_calibrated_mix"
down_revision: Union[str, None] = "0026_generic_dimensions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "calibrated_mix",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "calibrated_mix")
