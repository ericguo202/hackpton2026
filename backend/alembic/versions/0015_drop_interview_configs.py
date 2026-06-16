"""drop the unused interview_configs table and interview_sessions.config_id

The `interview_configs` table was provisioned in 0001 for an "AI-generated plan
created before a session starts" feature that was never built: no flow ever
INSERTs a config row, nothing reads one back, and `interview_sessions.config_id`
is always NULL. The ORM model, its FK column, and the `interview_type` enum were
removed in the same change that adds this migration, so this drops the matching
dead schema.

Ordering (upgrade): drop `config_id` first — that removes the auto-named FK from
interview_sessions → interview_configs — then the index, then the table, then the
now-orphaned `interview_type` enum type. Downgrade fully reconstructs the 0001
definitions so the migration is reversible.

Revision ID: 0015_drop_interview_configs
Revises: 0014_policy_acceptance
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0015_drop_interview_configs"
down_revision: Union[str, None] = "0014_policy_acceptance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the dependent FK column on interview_sessions before the table it
    # references. Dropping the column also drops its (auto-named) FK constraint.
    op.drop_column("interview_sessions", "config_id")
    op.drop_index("idx_configs_user_id", table_name="interview_configs")
    op.drop_table("interview_configs")
    # The enum type was used only by interview_configs.interview_type.
    op.execute("DROP TYPE IF EXISTS interview_type")


def downgrade() -> None:
    # Recreate the enum type, then the table, index, and FK column exactly as
    # 0001_init defined them.
    op.execute(
        "CREATE TYPE interview_type AS ENUM ('behavioral', 'technical', 'mixed')"
    )
    op.create_table(
        "interview_configs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company", sa.Text(), nullable=False),
        sa.Column("job_title", sa.Text(), nullable=False),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column("company_context", sa.Text(), nullable=True),
        sa.Column(
            "interview_type",
            postgresql.ENUM(
                "behavioral", "technical", "mixed",
                name="interview_type",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'behavioral'"),
        ),
        sa.Column(
            "num_turns",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("2"),
        ),
        sa.Column("ai_plan", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint("num_turns BETWEEN 1 AND 10", name="ck_configs_num_turns"),
    )
    op.create_index("idx_configs_user_id", "interview_configs", ["user_id"])
    op.add_column(
        "interview_sessions",
        sa.Column(
            "config_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
