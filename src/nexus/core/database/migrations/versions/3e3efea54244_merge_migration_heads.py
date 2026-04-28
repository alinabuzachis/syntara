"""merge migration heads

Revision ID: 3e3efea54244
Revises: 68655cddfd4f, 79db979d7144
Create Date: 2026-04-19 12:30:15.935176

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "3e3efea54244"
down_revision: str | Sequence[str] | None = ("68655cddfd4f", "79db979d7144")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
