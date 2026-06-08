"""add_timeout_count_to_usage_counters

Revision ID: b7f8a2c1d3e4
Revises: a1b2c3d4e5f6
Create Date: 2026-03-27 19:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7f8a2c1d3e4"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add timeout_count column to usage_counters table."""
    op.add_column(
        "usage_counters",
        sa.Column("timeout_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    """Remove timeout_count column from usage_counters table."""
    op.drop_column("usage_counters", "timeout_count")
