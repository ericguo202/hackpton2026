"""add speech_speed to interview_sessions

Persists the per-session ElevenLabs speech pace the candidate picked on the
setup form's Advanced panel ("Normal" = 1.1, "Slower" = 0.9), sent as
`voice_settings.speed`. Stored so turn 2's TTS plays at the same pace the
candidate chose for turn 1.

Nullable for backward compatibility: legacy rows created before this column
existed simply have `speech_speed IS NULL`. The TTS call sites fall back to
`tts.DEFAULT_SPEED` via `clamp_speed(None)` in that case.

Revision ID: 0021_session_speech_speed
Revises: 0020_face_calib_consent
Create Date: 2026-07-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0021_session_speech_speed"
down_revision: Union[str, None] = "0020_face_calib_consent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("speech_speed", sa.Numeric(3, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "speech_speed")
