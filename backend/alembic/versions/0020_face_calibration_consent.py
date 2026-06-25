"""add server-side face calibration consent fields

Face calibration consent was previously stored only in browser localStorage,
which leaked across accounts sharing a browser and could not be demonstrated
(GDPR Art. 7(1) / BIPA). It now lives on the user row as a versioned consent
timestamp plus a revocation timestamp, mirroring the delivery-analytics consent
columns. The calibration profile itself still stays on the device (now
namespaced per Clerk user).

Revision ID: 0020_face_calib_consent
Revises: 0019_custom_questions
Create Date: 2026-06-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020_face_calib_consent"
down_revision: Union[str, None] = "0019_custom_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "face_calibration_consent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "face_calibration_consent_version",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "face_calibration_revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "face_calibration_revoked_at")
    op.drop_column("users", "face_calibration_consent_version")
    op.drop_column("users", "face_calibration_consent_at")
