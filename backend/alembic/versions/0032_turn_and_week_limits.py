"""recast the free-tier daily cap as turns and add a weekly session cap

The free tier used to allow 5 completed SESSIONS per local day. That cap was
priced when every session was exactly 2 turns, so a session was a fixed unit of
spend. Variable session length (`0023_session_num_turns`, 2-8 turns) broke the
assumption — each turn costs an evaluator call, a coaching call, a next-question
call and a TTS synthesis, so 5 sessions now range from 10 to 40 turns of spend.

Two counters replace the one:

* `daily_turn_count` (renamed in place from `daily_session_count`) — turns
  ANSWERED today, capped at 10. Charged in `submit_turn` as each answer is
  persisted, so an abandoned session still pays for what it consumed.
* `weekly_session_count` / `week_reset_date` — sessions started this local week
  (Monday 00:00 boundary), capped at 10. Bounds the per-session fixed spend
  (company research + opening question + TTS) that the turn counter can't see.
  Charged on the session's FIRST answered turn.

`count_reset_date` is deliberately NOT renamed: "the local date the daily counter
was last stamped on" is still exactly what it holds.

No backfill. A user's in-flight `daily_session_count` simply becomes their turn
count for the remainder of that local day (an under-count of at most 5, in the
user's favour), and `weekly_session_count` starts everyone at 0.

DEPLOY NOTE: the rename is a breaking read for replicas still running the old
code — they select `daily_session_count` on every `GET /me`. Run this inside the
blue/green cutover window so the outgoing color drains. Same posture as
`0026_generic_dimensions`, which renamed five columns on `interview_turns`.

Revision ID: 0032_turn_week_limits
Revises: 0031_custom_question_cat
Create Date: 2026-08-09

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32), so anything longer fails the upgrade
bookkeeping write even after the schema changes commit.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0032_turn_week_limits"
down_revision: Union[str, None] = "0031_custom_question_cat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # In-place rename — the column keeps its NOT NULL, its `0` server default,
    # and every existing row's value. Only what we count changes.
    op.alter_column(
        "users",
        "daily_session_count",
        new_column_name="daily_turn_count",
    )
    # Server default backfills existing rows to 0 in the same ADD COLUMN.
    op.add_column(
        "users",
        sa.Column(
            "weekly_session_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    # NULL until the user's first session of any week — `IS DISTINCT FROM`
    # in the lazy-reset UPDATE treats that as "stale", so it self-seeds.
    op.add_column(
        "users",
        sa.Column("week_reset_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "week_reset_date")
    op.drop_column("users", "weekly_session_count")
    op.alter_column(
        "users",
        "daily_turn_count",
        new_column_name="daily_session_count",
    )
