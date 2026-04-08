"""merge heads

Revision ID: e727c88dd029
Revises: c4a5b6d7e8f9, 5fe2f0efbc02
Create Date: 2026-04-08 09:47:58.254645

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "e727c88dd029"
down_revision: str | Sequence[str] | None = ("c4a5b6d7e8f9", "5fe2f0efbc02")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
