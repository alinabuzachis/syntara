"""add user identity and identity provider authorization policies

Revision ID: a6a0d8d0ef9a
Revises: 229065ab56b0, 3ae0c84a048f
Create Date: 2026-04-14 16:08:19.254861

NOTE: This migration originally seeded builtin authorization policies and role
assignments via nexus.authz.migration_ops.  Those helpers have been removed;
builtin policies/roles are now managed purely in code.  The migration is
retained as a no-op to keep the Alembic revision chain intact.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "a6a0d8d0ef9a"
down_revision: str | Sequence[str] | None = ("229065ab56b0", "3ae0c84a048f")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
