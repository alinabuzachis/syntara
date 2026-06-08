"""merge auth and runtime settings branches

Revision ID: 60c7c1a00001
Revises: d28b79346805, e727c88dd029
Create Date: 2026-04-08 12:52:35.383278

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "60c7c1a00001"
down_revision: str | Sequence[str] | None = ("d28b79346805", "e727c88dd029")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
