"""add users.target_roles (multi-role support)

Adds a JSONB list column holding the full set of target roles a candidate
declared (1 required + up to 2 optional, max 3). The existing scalar
`target_role` becomes the ACTIVE role and is always one member of this list;
it continues to condition every downstream prompt, so keeping it avoids a
wide blast radius. The Home role switcher re-points `target_role` at another
member via `PUT /me/target-role`.

The server default `'[]'::jsonb` makes the ADD COLUMN clean and satisfies
NOT NULL for legacy rows; the UPDATE below then backfills every row that
already has a `target_role` with a single-element list so existing users
immediately have a coherent set. Rows with a NULL `target_role`
(pre-onboarding) keep the empty-list default.

Revision ID: 0022_target_roles
Revises: 0021_session_speech_speed
Create Date: 2026-07-12

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32) by default.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0022_target_roles"
down_revision: Union[str, None] = "0021_session_speech_speed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "target_roles",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    # Backfill existing users: their single target_role becomes a 1-element set.
    op.execute(
        "UPDATE users "
        "SET target_roles = jsonb_build_array(target_role) "
        "WHERE target_role IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("users", "target_roles")
