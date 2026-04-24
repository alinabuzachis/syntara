"""merge credential hard delete and role assignments

Revision ID: 6db6c2af08ac
Revises: 471c6755b5b1, 6b1efc62594e
Create Date: 2026-04-24 10:51:09.636518

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "6db6c2af08ac"
down_revision: str | Sequence[str] | None = ("471c6755b5b1", "6b1efc62594e")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
