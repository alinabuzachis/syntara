"""merge auth and token branches

Revision ID: d28b79346805
Revises: 604bda59c881, ff2dde768eeb
Create Date: 2026-04-06 12:58:36.941588

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "d28b79346805"
down_revision: str | Sequence[str] | None = ("604bda59c881", "ff2dde768eeb")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
