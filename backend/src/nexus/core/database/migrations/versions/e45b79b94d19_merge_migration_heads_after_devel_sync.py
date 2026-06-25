"""merge migration heads after devel sync

Revision ID: e45b79b94d19
Revises: 947411c742ef, af3fdc174f37
Create Date: 2026-06-22 08:55:12.858264

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "e45b79b94d19"
down_revision: str | Sequence[str] | None = ("947411c742ef", "af3fdc174f37")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
