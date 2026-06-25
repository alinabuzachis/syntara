"""merge integration and service account heads

Revision ID: 91a1c39e802e
Revises: 20eaf42e2d30, c7d8e9f01234
Create Date: 2026-06-24 17:22:09.314654

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "91a1c39e802e"
down_revision: str | Sequence[str] | None = ("20eaf42e2d30", "c7d8e9f01234")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
