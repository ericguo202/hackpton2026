"""add per-session turn count

Revision ID: 0023_session_num_turns
Revises: 0022_target_roles
Create Date: 2026-07-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023_session_num_turns"
down_revision: Union[str, None] = "0022_target_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "num_turns",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("2"),
        ),
    )
    op.create_check_constraint(
        "ck_sessions_num_turns",
        "interview_sessions",
        "num_turns BETWEEN 2 AND 8",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_sessions_num_turns",
        "interview_sessions",
        type_="check",
    )
    op.drop_column("interview_sessions", "num_turns")
