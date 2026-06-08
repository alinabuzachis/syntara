"""merge credential and settings migration heads

Revision ID: 29a22e82f87a
Revises: 8887beb22fc3, e727c88dd029
Create Date: 2026-04-08 20:57:00.990619

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "29a22e82f87a"
down_revision: str | Sequence[str] | None = ("8887beb22fc3", "e727c88dd029")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
