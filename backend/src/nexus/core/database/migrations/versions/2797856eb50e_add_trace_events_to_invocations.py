"""add trace_events to invocations

Revision ID: 2797856eb50e
Revises: ae8953c3abe9
Create Date: 2026-07-08 14:36:47.756626

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2797856eb50e"
down_revision: str | Sequence[str] | None = "ae8953c3abe9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("invocations", sa.Column("trace_events", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    # CUSTOM: GIN index for future JSONB containment queries on denormalized trace steps
    # (e.g. find invocations that called tool X via @> / jsonb_path_exists).
    op.create_index(
        "ix_invocations_trace_events_gin",
        "invocations",
        ["trace_events"],
        unique=False,
        postgresql_using="gin",
    )
    # END CUSTOM


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_invocations_trace_events_gin", table_name="invocations", postgresql_using="gin")
    op.drop_column("invocations", "trace_events")
