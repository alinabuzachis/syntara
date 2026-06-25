"""merge heads

Revision ID: 20eaf42e2d30
Revises: e45b79b94d19, f3be35b8c6a9
Create Date: 2026-06-22 18:12:58.262196

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "20eaf42e2d30"
down_revision: str | Sequence[str] | None = ("e45b79b94d19", "f3be35b8c6a9")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
