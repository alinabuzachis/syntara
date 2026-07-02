"""merge llm_models with devel

Revision ID: a5bd3cf4d61c
Revises: 66a534c1807b, c4e5f6a7b890
Create Date: 2026-06-29 13:44:00.249210

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "a5bd3cf4d61c"
down_revision: str | Sequence[str] | None = ("66a534c1807b", "c4e5f6a7b890")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
