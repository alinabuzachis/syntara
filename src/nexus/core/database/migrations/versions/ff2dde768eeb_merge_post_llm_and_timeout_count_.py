"""merge post-llm and timeout_count migrations

Revision ID: ff2dde768eeb
Revises: a63aa69e19d0, b7f8a2c1d3e4
Create Date: 2026-04-02 10:23:28.102385

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "ff2dde768eeb"
down_revision: str | Sequence[str] | None = ("a63aa69e19d0", "b7f8a2c1d3e4")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
