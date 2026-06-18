"""merge principals and file_metadata_project_id migrations

Revision ID: af3fdc174f37
Revises: a0b1c2d3e4f5, b810b197d930
Create Date: 2026-06-18 20:31:22.741003

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "af3fdc174f37"
down_revision: str | Sequence[str] | None = ("a0b1c2d3e4f5", "b810b197d930")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
