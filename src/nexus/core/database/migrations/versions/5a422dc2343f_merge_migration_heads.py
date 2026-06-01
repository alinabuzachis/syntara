"""merge_migration_heads

Revision ID: 5a422dc2343f
Revises: 85a9ee06be23, a7f2e1b3c4d5
Create Date: 2026-06-01 06:22:49.660169

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "5a422dc2343f"
down_revision: str | Sequence[str] | None = ("85a9ee06be23", "a7f2e1b3c4d5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
