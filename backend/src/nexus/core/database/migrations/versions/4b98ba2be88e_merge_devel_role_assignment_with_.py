"""merge devel role_assignment with version status refactor

Revision ID: 4b98ba2be88e
Revises: 7b15edee0361, d8a3f5e7b912
Create Date: 2026-07-15 08:46:23.668341

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "4b98ba2be88e"
down_revision: str | Sequence[str] | None = ("7b15edee0361", "d8a3f5e7b912")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
