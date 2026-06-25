"""merge migration heads

Revision ID: 947411c742ef
Revises: a0b1c2d3e4f5, e31d8e007444
Create Date: 2026-06-18 15:04:13.855845

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "947411c742ef"
down_revision: str | Sequence[str] | None = ("a0b1c2d3e4f5", "e31d8e007444")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
