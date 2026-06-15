"""merge approval unique constraint with webhook trigger

Revision ID: cedd8e9158c6
Revises: bd5c6f10c969, 05d8708c4137
Create Date: 2026-06-09 10:13:56.002386

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "cedd8e9158c6"
down_revision: str | Sequence[str] | None = ("bd5c6f10c969", "05d8708c4137")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
