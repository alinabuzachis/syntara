"""add warning to integration_refresh_status enum

Revision ID: c8e3a5b26d44
Revises: b7d2f4a19c33
Create Date: 2026-07-30 10:00:01.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8e3a5b26d44"
down_revision: str | Sequence[str] | None = "b7d2f4a19c33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add 'warning' value to the integration_refresh_status PostgreSQL enum."""
    # CUSTOM: ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
    # so we execute it outside the default Alembic transaction.
    op.execute("ALTER TYPE integration_refresh_status ADD VALUE IF NOT EXISTS 'warning' AFTER 'available'")
    # END CUSTOM


def downgrade() -> None:
    """Remove 'warning' value from the integration_refresh_status PostgreSQL enum.

    PostgreSQL does not support removing individual enum values directly.
    A full enum recreation would be required, which is destructive if rows
    reference the value. Leaving as a no-op; the value is harmless if unused.
    """
