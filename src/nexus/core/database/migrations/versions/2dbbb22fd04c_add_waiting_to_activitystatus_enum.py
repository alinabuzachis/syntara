"""add waiting to activitystatus enum

Revision ID: 2dbbb22fd04c
Revises: 526156818004
Create Date: 2026-04-13 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2dbbb22fd04c"
down_revision: str | Sequence[str] | None = "526156818004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add 'waiting' value to the activitystatus PostgreSQL enum."""
    # CUSTOM: ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
    # so we execute it outside the default Alembic transaction.
    op.execute("ALTER TYPE activitystatus ADD VALUE IF NOT EXISTS 'waiting' AFTER 'running'")
    # END CUSTOM


def downgrade() -> None:
    """Remove 'waiting' value from the activitystatus PostgreSQL enum.

    PostgreSQL does not support removing individual enum values directly.
    A full enum recreation would be required, which is destructive if rows
    reference the value. Leaving as a no-op; the value is harmless if unused.
    """
