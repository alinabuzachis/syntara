"""merge settings and upstream migrations

Revision ID: cabd38ece246
Revises: 229065ab56b0, a7b8c9d0e1f2
Create Date: 2026-04-14 11:58:59.570527

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "cabd38ece246"
down_revision: str | Sequence[str] | None = ("229065ab56b0", "a7b8c9d0e1f2")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
