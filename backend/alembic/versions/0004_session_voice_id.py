"""add voice_id to interview_sessions

Persists the ElevenLabs voice the candidate (or the auto-randomizer)
picked for this session, so turn 2 plays in the same voice as turn 1
without re-deriving it from the session UUID.

Nullable for backward compatibility: legacy rows finalized before this
column existed simply have `voice_id IS NULL`. The TTS call site falls
back to `voice_pool.voice_for_session(session.id)` in that case, which
is exactly how voice was resolved before this migration.

Revision ID: 0004_session_voice_id
Revises: 0003_avg_delivery_on_metrics
Create Date: 2026-04-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_session_voice_id"
down_revision: Union[str, None] = "0003_avg_delivery_on_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("voice_id", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "voice_id")
