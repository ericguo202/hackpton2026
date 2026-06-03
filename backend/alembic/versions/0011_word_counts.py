"""add per-turn word_count + session total_word_count (filler rate denominator)

Adds the denominator for the filler-word RATE metric (fillers / words):

  * `interview_turns.word_count` — total word count of the turn transcript
    (whitespace tokenization), sibling of `filler_word_count`. Written in
    `submit_turn`. NOT NULL, default 0.
  * `session_metrics.total_word_count` — sum of per-turn word_count across the
    session, sibling of `total_filler_word_count`. Nullable.

Both are BACKFILLED from existing `interview_turns.transcript_text` (which is
persisted for every evaluated turn), so the filler rate is accurate across the
entire history with no gap. The SQL word count mirrors the Python
`count_words` helper (`str.split()`): split the trimmed transcript on
whitespace runs and take the array length, guarding empty/whitespace-only
transcripts (which stay 0).

Order matters: turns.word_count is backfilled FIRST, then
session_metrics.total_word_count sums the now-populated per-turn values.

Revision ID: 0011_word_counts
Revises: 0010_saved_questions
Create Date: 2026-06-02

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_word_counts"
down_revision: Union[str, None] = "0010_saved_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. New columns. word_count is NOT NULL default 0 (mirrors
    #    filler_word_count); total_word_count is nullable (mirrors
    #    total_filler_word_count).
    op.add_column(
        "interview_turns",
        sa.Column(
            "word_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "session_metrics",
        sa.Column("total_word_count", sa.Integer(), nullable=True),
    )

    # 2. Backfill per-turn word_count from transcript text. Whitespace
    #    tokenization mirrors Python's str.split(): trim, split on \s+ runs,
    #    count. Skip NULL / whitespace-only transcripts (they keep 0).
    op.execute(
        r"""
        UPDATE interview_turns
        SET word_count = array_length(
            regexp_split_to_array(btrim(transcript_text), '\s+'), 1
        )
        WHERE transcript_text IS NOT NULL
          AND btrim(transcript_text) <> ''
        """
    )

    # 3. Backfill session-level total_word_count by summing the per-turn
    #    word_count populated above.
    op.execute(
        """
        UPDATE session_metrics sm
        SET total_word_count = sub.total
        FROM (
            SELECT session_id, SUM(word_count) AS total
            FROM interview_turns
            GROUP BY session_id
        ) sub
        WHERE sm.session_id = sub.session_id
        """
    )


def downgrade() -> None:
    op.drop_column("session_metrics", "total_word_count")
    op.drop_column("interview_turns", "word_count")
