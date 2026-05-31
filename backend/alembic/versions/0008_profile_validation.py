"""add profile and company validation metadata

Revision ID: 0008_profile_validation
Revises: 0007_user_tier_limits
Create Date: 2026-05-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_profile_validation"
down_revision: Union[str, None] = "0007_user_tier_limits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("canonical_target_role", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("target_role_soc_code", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("target_role_validation_source", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("industry_category", sa.Text(), nullable=True))
    op.add_column(
        "interview_sessions",
        sa.Column(
            "company_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
    )
    op.add_column(
        "interview_sessions",
        sa.Column("company_validation_source", sa.Text(), nullable=True),
    )
    op.add_column(
        "interview_sessions",
        sa.Column("company_domain", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "company_domain")
    op.drop_column("interview_sessions", "company_validation_source")
    op.drop_column("interview_sessions", "company_verified")
    op.drop_column("users", "industry_category")
    op.drop_column("users", "target_role_validation_source")
    op.drop_column("users", "target_role_soc_code")
    op.drop_column("users", "canonical_target_role")
