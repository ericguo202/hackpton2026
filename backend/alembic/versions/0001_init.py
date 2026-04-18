"""init schema: users, interview_configs, interview_sessions, interview_turns, session_metrics

Hand-written (not autogen). Autogen misses enum CREATE TYPE, CHECK constraints,
extensions, and plpgsql triggers — all of which this schema needs.

Revision ID: 0001_init
Revises:
Create Date: 2026-04-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # gen_random_uuid() lives in pgcrypto on Postgres < 13; on 17 it's also in
    # the core extension, but enabling pgcrypto is portable and idempotent.
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')

    # --- ENUMS ---
    op.execute(
        "CREATE TYPE experience_level AS ENUM "
        "('internship', 'entry', 'mid', 'senior', 'staff', 'executive')"
    )
    op.execute(
        "CREATE TYPE session_status AS ENUM "
        "('pending', 'in_progress', 'completed', 'abandoned')"
    )
    op.execute(
        "CREATE TYPE interview_type AS ENUM "
        "('behavioral', 'technical', 'mixed')"
    )

    # --- users ---
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("clerk_user_id", sa.Text(), nullable=False, unique=True),
        sa.Column("email", sa.Text(), nullable=True, unique=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("resume_text", sa.Text(), nullable=True),
        sa.Column("industry", sa.Text(), nullable=True),
        sa.Column("target_role", sa.Text(), nullable=True),
        sa.Column(
            "experience_level",
            postgresql.ENUM(
                "internship", "entry", "mid", "senior", "staff", "executive",
                name="experience_level",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("short_bio", sa.Text(), nullable=True),
        sa.Column(
            "completed_registration",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("idx_users_clerk_user_id", "users", ["clerk_user_id"])
    op.create_index("idx_users_email", "users", ["email"])

    # --- interview_configs ---
    op.create_table(
        "interview_configs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company", sa.Text(), nullable=False),
        sa.Column("job_title", sa.Text(), nullable=False),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column("company_context", sa.Text(), nullable=True),
        sa.Column(
            "interview_type",
            postgresql.ENUM(
                "behavioral", "technical", "mixed",
                name="interview_type",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'behavioral'"),
        ),
        sa.Column(
            "num_turns",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("2"),
        ),
        sa.Column("ai_plan", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint("num_turns BETWEEN 1 AND 10", name="ck_configs_num_turns"),
    )
    op.create_index("idx_configs_user_id", "interview_configs", ["user_id"])

    # --- interview_sessions ---
    op.create_table(
        "interview_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "config_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending", "in_progress", "completed", "abandoned",
                name="session_status",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("company", sa.Text(), nullable=False),
        sa.Column("job_title", sa.Text(), nullable=False),
        sa.Column("company_summary", sa.Text(), nullable=True),
        sa.Column("overall_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("ended_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "overall_score BETWEEN 0 AND 100",
            name="ck_sessions_overall_score",
        ),
    )
    op.create_index("idx_sessions_user_id", "interview_sessions", ["user_id"])
    op.create_index("idx_sessions_status", "interview_sessions", ["status"])
    op.create_index(
        "idx_sessions_created_at",
        "interview_sessions",
        [sa.text("created_at DESC")],
    )

    # --- interview_turns ---
    op.create_table(
        "interview_turns",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("turn_number", sa.Integer(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("transcript_text", sa.Text(), nullable=True),
        sa.Column(
            "is_followup",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "parent_turn_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_turns.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("directness_score", sa.Numeric(3, 1), nullable=True),
        sa.Column("star_score", sa.Numeric(3, 1), nullable=True),
        sa.Column("specificity_score", sa.Numeric(3, 1), nullable=True),
        sa.Column("impact_score", sa.Numeric(3, 1), nullable=True),
        sa.Column("conciseness_score", sa.Numeric(3, 1), nullable=True),
        sa.Column(
            "filler_word_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "filler_word_breakdown",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("ai_model_used", sa.Text(), nullable=True),
        sa.Column("evaluated_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "session_id", "turn_number", name="uq_turns_session_turn"
        ),
        sa.CheckConstraint("turn_number >= 1", name="ck_turns_turn_number"),
        sa.CheckConstraint(
            "directness_score BETWEEN 0 AND 10", name="ck_turns_directness"
        ),
        sa.CheckConstraint("star_score BETWEEN 0 AND 10", name="ck_turns_star"),
        sa.CheckConstraint(
            "specificity_score BETWEEN 0 AND 10", name="ck_turns_specificity"
        ),
        sa.CheckConstraint("impact_score BETWEEN 0 AND 10", name="ck_turns_impact"),
        sa.CheckConstraint(
            "conciseness_score BETWEEN 0 AND 10", name="ck_turns_conciseness"
        ),
    )
    op.create_index("idx_turns_session_id", "interview_turns", ["session_id"])

    # --- session_metrics ---
    op.create_table(
        "session_metrics",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("avg_directness", sa.Numeric(3, 1), nullable=True),
        sa.Column("avg_star", sa.Numeric(3, 1), nullable=True),
        sa.Column("avg_specificity", sa.Numeric(3, 1), nullable=True),
        sa.Column("avg_impact", sa.Numeric(3, 1), nullable=True),
        sa.Column("avg_conciseness", sa.Numeric(3, 1), nullable=True),
        sa.Column("total_filler_word_count", sa.Integer(), nullable=True),
        sa.Column("overall_score", sa.Numeric(4, 2), nullable=True),
        sa.Column(
            "turns_evaluated",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "generated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "overall_score BETWEEN 0 AND 100",
            name="ck_metrics_overall_score",
        ),
    )

    # --- set_updated_at() trigger function + triggers ---
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_sessions_updated_at
            BEFORE UPDATE ON interview_sessions
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )


def downgrade() -> None:
    # Triggers depend on the function; drop them first.
    op.execute("DROP TRIGGER IF EXISTS trg_sessions_updated_at ON interview_sessions")
    op.execute("DROP TRIGGER IF EXISTS trg_users_updated_at ON users")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")

    # Tables — drop in reverse FK order.
    op.drop_table("session_metrics")
    op.drop_index("idx_turns_session_id", table_name="interview_turns")
    op.drop_table("interview_turns")
    op.drop_index("idx_sessions_created_at", table_name="interview_sessions")
    op.drop_index("idx_sessions_status", table_name="interview_sessions")
    op.drop_index("idx_sessions_user_id", table_name="interview_sessions")
    op.drop_table("interview_sessions")
    op.drop_index("idx_configs_user_id", table_name="interview_configs")
    op.drop_table("interview_configs")
    op.drop_index("idx_users_email", table_name="users")
    op.drop_index("idx_users_clerk_user_id", table_name="users")
    op.drop_table("users")

    # Enums — drop after all columns that reference them are gone.
    op.execute("DROP TYPE IF EXISTS interview_type")
    op.execute("DROP TYPE IF EXISTS session_status")
    op.execute("DROP TYPE IF EXISTS experience_level")

    # Leave pgcrypto alone — may be shared with other schemas.
