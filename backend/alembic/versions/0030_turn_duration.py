"""add per-turn duration_seconds + session total_duration_seconds (WPM denominator)

Adds the denominator for the speaking-pace metric (words per minute):

  * `interview_turns.duration_seconds` — the SPEECH SPAN of the turn, derived
    in `stt.py:_speech_span_seconds` from the ElevenLabs word timestamps
    (first word's start → last word's end). Written in `submit_turn` alongside
    `word_count`.
  * `session_metrics.total_duration_seconds` — sum of the per-turn spans across
    the session, sibling of `total_word_count`. The session-level pace is
    word-weighted (Σwords ÷ Σminutes), matching how the lifetime filler rate is
    computed in `me.py`.

Both are NULLABLE with NO default — unlike `0011_word_counts`, this one is
deliberately NOT backfilled. Word counts were recoverable from the stored
transcript; a speech span is not recoverable from anything we persisted, so
legacy rows are genuinely unmeasured. `0` would be indistinguishable from a
real measurement, and `speaking_pace_wpm` returns None on NULL, which renders
as an em-dash rather than a fabricated number.

NUMERIC rather than float so the value round-trips exactly; (6,2) covers the
5-minute per-turn recording cap with room to spare, (8,2) the session sum.

Revision ID: 0030_turn_duration
Revises: 0029_feedback_features
Create Date: 2026-07-30

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0030_turn_duration"
down_revision: Union[str, None] = "0029_feedback_features"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_turns",
        sa.Column("duration_seconds", sa.Numeric(6, 2), nullable=True),
    )
    op.add_column(
        "session_metrics",
        sa.Column("total_duration_seconds", sa.Numeric(8, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_metrics", "total_duration_seconds")
    op.drop_column("interview_turns", "duration_seconds")
