"""merge heads

Revision ID: 2c78b9c20997
Revises: 12da74e24c7b, 91a1c39e802e
Create Date: 2026-06-25 15:45:27.343713

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "2c78b9c20997"
down_revision: str | Sequence[str] | None = ("12da74e24c7b", "91a1c39e802e")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
