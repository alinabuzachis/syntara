"""merge credential and main migrations

Revision ID: 8887beb22fc3
Revises: 6f1849ea0356, ff2dde768eeb
Create Date: 2026-04-07 14:00:43.004775

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "8887beb22fc3"
down_revision: str | Sequence[str] | None = ("6f1849ea0356", "ff2dde768eeb")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
