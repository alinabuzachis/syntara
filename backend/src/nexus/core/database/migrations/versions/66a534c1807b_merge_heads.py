"""merge heads

Revision ID: 66a534c1807b
Revises: 2c78b9c20997, 6c19b1305293
Create Date: 2026-06-25 18:52:03.221440

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "66a534c1807b"
down_revision: str | Sequence[str] | None = ("2c78b9c20997", "6c19b1305293")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
