"""add per-version Terms / Privacy acceptance record to users

Closes the clickwrap-enforceability gap flagged in TERMS_REVIEW.md: courts will
not enforce posted (or modified) terms without an affirmative "I agree" plus a
per-user, per-version, timestamped acceptance record. These four nullable columns
are that record — a version number and timestamp for each of the Terms of Service
and the Privacy Policy. NULL means "never accepted the current version", which the
forced acceptance gate uses to (re-)prompt. Mirrors the delivery-analytics consent
columns added in 0013.

Revision ID: 0014_policy_acceptance
Revises: 0013_delivery_consent
Create Date: 2026-06-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_policy_acceptance"
down_revision: Union[str, None] = "0013_delivery_consent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("terms_accepted_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "terms_accepted_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "users",
        sa.Column("privacy_accepted_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "privacy_accepted_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "privacy_accepted_at")
    op.drop_column("users", "privacy_accepted_version")
    op.drop_column("users", "terms_accepted_at")
    op.drop_column("users", "terms_accepted_version")
