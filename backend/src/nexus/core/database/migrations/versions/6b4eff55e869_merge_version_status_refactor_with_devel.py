"""merge version status refactor with devel

Revision ID: 6b4eff55e869
Revises: c4f7a1b2d3e5, eeb222146519
Create Date: 2026-07-09 19:34:27.533401

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "6b4eff55e869"
down_revision: str | Sequence[str] | None = ("c4f7a1b2d3e5", "eeb222146519")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
