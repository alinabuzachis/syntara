"""merge tool_provider and executions migrations

Revision ID: 68bd8e14bec3
Revises: a36a35559ac4, a62fcd46bef1
Create Date: 2025-10-29 16:02:24.133065

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "68bd8e14bec3"
down_revision: str | Sequence[str] | None = ("a36a35559ac4", "a62fcd46bef1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
