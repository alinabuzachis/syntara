"""add settings authz policies

Revision ID: 68655cddfd4f
Revises: cabd38ece246
Create Date: 2026-04-14 20:47:51.037183

NOTE: This migration originally seeded builtin authorization policies and role
assignments via nexus.authz.migration_ops.  Those helpers have been removed;
builtin policies/roles are now managed purely in code.  The migration is
retained as a no-op to keep the Alembic revision chain intact.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "68655cddfd4f"
down_revision: str | Sequence[str] | None = ("cabd38ece246", "e74ecb4eec0b")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
