"""merge webhook_trigger_sa with trace_events heads

Revision ID: 6ff1a0aa66d5
Revises: 460f6329a0a1, b2a1bba0c390
Create Date: 2026-07-23 19:01:08.233403

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "6ff1a0aa66d5"
down_revision: str | Sequence[str] | None = ("460f6329a0a1", "b2a1bba0c390")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
