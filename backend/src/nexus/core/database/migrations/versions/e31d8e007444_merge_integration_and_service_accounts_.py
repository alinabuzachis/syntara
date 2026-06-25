"""merge integration and service_accounts heads

Revision ID: e31d8e007444
Revises: a0f042999fd8, 2b9a0af86b18
Create Date: 2026-06-17 12:44:04.277157

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "e31d8e007444"
down_revision: str | Sequence[str] | None = ("a0f042999fd8", "a1b2c3d4e5f7")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
