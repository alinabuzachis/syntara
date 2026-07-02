"""merge llm_models with invocation project_id

Revision ID: 191cfe006309
Revises: a5bd3cf4d61c, c311711bb5c8
Create Date: 2026-06-30 09:59:01.267540

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "191cfe006309"
down_revision: str | Sequence[str] | None = ("a5bd3cf4d61c", "c311711bb5c8")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
