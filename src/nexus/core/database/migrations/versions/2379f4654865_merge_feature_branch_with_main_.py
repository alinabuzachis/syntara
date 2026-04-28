"""merge feature branch with main migrations

Revision ID: 2379f4654865
Revises: 6299a2bfd675, 6db6c2af08ac
Create Date: 2026-04-24 12:36:11.525172

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "2379f4654865"
down_revision: str | Sequence[str] | None = ("6299a2bfd675", "6db6c2af08ac")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
