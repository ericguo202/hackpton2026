"""cap per-session turn count at 8

Revision ID: 0022_cap_session_num_turns_at_8
Revises: 0021_session_num_turns
Create Date: 2026-07-03
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0022_cap_session_num_turns_at_8"
down_revision: Union[str, None] = "0021_session_num_turns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_sessions_num_turns",
        "interview_sessions",
        type_="check",
    )
    op.execute("UPDATE interview_sessions SET num_turns = 8 WHERE num_turns > 8")
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
    op.create_check_constraint(
        "ck_sessions_num_turns",
        "interview_sessions",
        "num_turns BETWEEN 2 AND 10",
    )
