"""merge migration heads

Revision ID: ab929d923674
Revises: 96ea00d1bc4d, 9cf75786579f
Create Date: 2026-07-07 18:16:39.039815

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "ab929d923674"
down_revision: str | Sequence[str] | None = ("96ea00d1bc4d", "9cf75786579f")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
