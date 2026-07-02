"""merge migration heads

Revision ID: 805e882ad9b6
Revises: 191cfe006309, e4189dcce99c
Create Date: 2026-07-01 08:54:33.974763

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "805e882ad9b6"
down_revision: str | Sequence[str] | None = ("191cfe006309", "e4189dcce99c")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
