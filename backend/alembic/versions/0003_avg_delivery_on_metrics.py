"""add avg_delivery to session_metrics

Mirrors the 6th rubric dimension we added to `interview_turns` in 0002.
Without this column, completed sessions would persist five averaged
dimensions while the live evaluator response carries six — the history
list endpoint would then silently lose the delivery line on every chart.

Revision ID: 0003_avg_delivery_on_metrics
Revises: 0002_delivery_cv_summary
Create Date: 2026-04-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_avg_delivery_on_metrics"
down_revision: Union[str, None] = "0002_delivery_cv_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "session_metrics",
        sa.Column("avg_delivery", sa.Numeric(3, 1), nullable=True),
    )
    op.create_check_constraint(
        "ck_metrics_avg_delivery",
        "session_metrics",
        "avg_delivery BETWEEN 0 AND 10",
    )


def downgrade() -> None:
    op.drop_constraint("ck_metrics_avg_delivery", "session_metrics", type_="check")
    op.drop_column("session_metrics", "avg_delivery")
