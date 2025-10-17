"""create invocations table

Revision ID: 644f97ed1d9a
Revises: ae2e6da05883
Create Date: 2025-10-14 17:05:01.978353

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "644f97ed1d9a"
down_revision: str | Sequence[str] | None = "ae2e6da05883"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema - create invocations table."""
    # Create invocations table
    op.create_table(
        "invocations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("context_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("checkpoint_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invocations")),
    )

    # Create indexes for invocations table
    op.create_index(op.f("ix_invocations_status"), "invocations", ["status"], unique=False)
    op.create_index(op.f("ix_invocations_user_id"), "invocations", ["user_id"], unique=False)
    op.create_index(op.f("ix_invocations_session_id"), "invocations", ["session_id"], unique=False)
    op.create_index(
        op.f("ix_invocations_user_id_status"),
        "invocations",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_invocations_created_at"),
        "invocations",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema - drop invocations table."""
    # Drop indexes
    op.drop_index(op.f("ix_invocations_created_at"), table_name="invocations")
    op.drop_index(op.f("ix_invocations_user_id_status"), table_name="invocations")
    op.drop_index(op.f("ix_invocations_session_id"), table_name="invocations")
    op.drop_index(op.f("ix_invocations_user_id"), table_name="invocations")
    op.drop_index(op.f("ix_invocations_status"), table_name="invocations")

    # Drop table
    op.drop_table("invocations")
