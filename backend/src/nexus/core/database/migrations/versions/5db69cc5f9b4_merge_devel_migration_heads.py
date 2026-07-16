"""merge devel migration heads

Revision ID: 5db69cc5f9b4
Revises: 4b98ba2be88e, 875116a6a880
Create Date: 2026-07-16 09:59:39.022143

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "5db69cc5f9b4"
down_revision: str | Sequence[str] | None = ("4b98ba2be88e", "875116a6a880")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
