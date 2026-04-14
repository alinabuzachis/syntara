"""merge credential and auth migration heads

Revision ID: 5835100415bc
Revises: 29a22e82f87a, 60c7c1a00001
Create Date: 2026-04-09 16:45:02.559650

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "5835100415bc"
down_revision: str | Sequence[str] | None = ("29a22e82f87a", "60c7c1a00001")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
